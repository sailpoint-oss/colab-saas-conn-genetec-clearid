import { AxiosResponse } from 'axios'
import {
    Context,
    ConnectorError,
    createConnector,
    readConfig,
    logger,
    Response,
    StdAccountCreateInput,
    StdAccountCreateOutput,
    StdAccountListOutput,
    StdAccountReadInput,
    StdAccountReadOutput,
    StdAccountUpdateInput,
    StdAccountUpdateOutput,
    StdEntitlementListOutput,
    StdEntitlementReadOutput,
    StdEntitlementReadInput,
    StdTestConnectionOutput,
    AttributeChangeOp,
    StdAccountDisableInput,
    StdAccountDisableOutput,
    StdAccountEnableOutput,
    StdAccountEnableInput,
    AttributeChange,
} from '@sailpoint/connector-sdk'
import { HTTPClient } from './http-client'
import { Account } from './model/account'
import { Group } from './model/group'

// Connector must be exported as module property named connector
export const connector = async () => {
    const roleRegex = /.{8}-.{4}-.{4}-.{4}-.{12}/
    const principalRegex = /\[(.+)\]/
    const principalRoles = ['[user]', '[admin]']
    const approverAttribute = 'approverId'

    // Get connector source config
    const config = await readConfig()

    // Use the vendor SDK, or implement own client as necessary, to initialize a client
    const client = new HTTPClient(config)

    const getProvisioningAttributes = (): string[] => {
        return config.provisioningAttributes || []
    }

    const readAccount = async (id: string): Promise<Account> => {
        const response1: AxiosResponse = await client.getAccount(id)
        const account: Account = new Account(response1.data)
        const response2: AxiosResponse = await client.getUserRoles(id)
        const roles = response2.data.teams.map((x: { teamId: any }) => x.teamId)
        const attributes: string[] = (account.attributes.provisioningAttributes as string[]) || []
        let provisioningAttributes: string[]
        if (config.includeAllProvisioningAttributes) {
            provisioningAttributes = attributes
        } else {
            const providedProvisioningAttributes = getProvisioningAttributes()
            provisioningAttributes = providedProvisioningAttributes.filter((x: string) => attributes.includes(x))
        }
        const response3 = await client.getIdentityPrincipal(id)
        const principalRoles = response3.data.roles ? response3.data.roles.map((x: string) => `[${x}]`) : []
        account.attributes.roles = [...roles, ...provisioningAttributes, ...principalRoles]

        return account
    }

    const assignUserRole = async (account: Account, role: string) => {
        if (roleRegex.test(role)) {
            await client.assignUserRole(role, account.identity)
        } else if (principalRegex.test(role)) {
            await assignUserPrincipal(account, role)
        } else {
            const provisioningAttributes = [...(account.attributes.provisioningAttributes as string[]), role]
            const data = {
                eTag: account.attributes.eTag,
                systemData: {
                    provisioningAttributes: provisioningAttributes.map((x) => ({ name: x })),
                },
            }
            const response = await client.updateAccount(account.identity, data)
        }
    }

    const removeUserRole = async (account: Account, role: string) => {
        if (roleRegex.test(role)) {
            await client.removeUserRole(role, account.identity)
        } else if (principalRegex.test(role)) {
            await removeUserPrincipal(account.identity)
        } else {
            const provisioningAttributes = [...(account.attributes.provisioningAttributes as string[])].filter(
                (x) => x !== role
            )
            const data = {
                eTag: account.attributes.eTag,
                systemData: {
                    provisioningAttributes: provisioningAttributes.map((x) => ({ name: x })),
                },
            }
            const response = await client.updateAccount(account.identity, data)
        }
    }

    const updateUser = async (account: Account, change: AttributeChange, value: string) => {
        const fragment = getUserProfileFragment(change.attribute, value)
        const data = {
            ...fragment,
            eTag: account.attributes.eTag,
        }
        const response = await client.updateAccount(account.identity, data)
    }

    const assignUserPrincipal = async (account: Account, role: string) => {
        const principalRole = principalRegex.exec(role)?.at(1)
        if (principalRole) {
            if (account.attributes.email) {
                await client.assignUserPrincipal(account.identity, account.attributes.email as string, principalRole)
            } else {
                throw new Error('Account needs an existing email to get a principal role')
            }
        } else {
            throw new Error('Invalid principal role')
        }
    }

    const removeUserPrincipal = async (id: string) => {
        const response1 = await client.getIdentityPrincipal(id)
        const principal = response1.data.principalId
        const response2 = await client.removeUserPrincipal(principal)
    }

    const getGroupFromAttribute = (attribute: string): Group => {
        const group = new Group({
            teamId: attribute,
            name: attribute,
            description: 'Provisioning Attribute',
            status: 'Active',
        })
        group.attributes.type = 'Provisioning Attribute'

        return group
    }

    const getGroupFromPrincipalRole = (attribute: string): Group => {
        const group = new Group({
            teamId: attribute,
            name: attribute,
            description: 'Principal Role',
            status: 'Active',
        })
        group.attributes.type = 'Principal Role'

        return group
    }

    const getUserProfileFragment = (attribute: string, value: any): object => {
        if (attribute === approverAttribute) {
            return {
                companyData: {
                    approvers: [
                        {
                            approverId: value,
                        },
                    ],
                },
            }
        } else {
            return attribute
                .split('.')
                .reverse()
                .reduce((p: object, n: string) => Object.fromEntries([[n, p]]), value)
        }
    }

    return createConnector()
        .stdTestConnection(async (context: Context, input: undefined, res: Response<StdTestConnectionOutput>) => {
            logger.info('std:test-connection')
            const response: AxiosResponse = await client.testConnection()
            if (response.status != 200) {
                throw new ConnectorError('Unable to connect to ClearID')
            } else {
                res.send({})
            }
        })
        .stdAccountList(async (context: Context, input: undefined, res: Response<StdAccountListOutput>) => {
            logger.info('std:account:list')
            const response: AxiosResponse = await client.getAccounts()
            for (const acc of response.data.filter((x: { isDeleted: any }) => !x.isDeleted)) {
                const account: Account = await readAccount(acc.identityId)

                logger.info(account)
                res.send(account)
            }
        })
        .stdAccountRead(async (context: Context, input: StdAccountReadInput, res: Response<StdAccountReadOutput>) => {
            logger.info('std:account:read')
            logger.info(input)
            const account = await readAccount(input.identity)

            logger.info(account)
            res.send(account)
        })
        .stdAccountCreate(
            async (context: Context, input: StdAccountCreateInput, res: Response<StdAccountCreateOutput>) => {
                logger.info('std:account:create')
                logger.info(input)
                let data = {}
                for (let attribute of Object.keys(input.attributes)) {
                    if (attribute !== 'roles') {
                        const fragment = getUserProfileFragment(attribute, input.attributes[attribute])
                        data = { ...data, ...fragment }
                    }
                }
                const response = await client.createAccount(data)
                for (const role of [].concat(input.attributes.roles)) {
                    const account = await readAccount(response.data.identityId)
                    await assignUserRole(account, role)
                }
                const account = await readAccount(response.data.identityId)

                logger.info(account)
                res.send(account)
            }
        )
        .stdAccountDisable(
            async (context: Context, input: StdAccountDisableInput, res: Response<StdAccountDisableOutput>) => {
                logger.info('std:account:disable')
                logger.info(input)

                const status = 'Inactive'
                const account = await readAccount(input.identity)
                const data = {
                    eTag: account.attributes.eTag,
                    status,
                }
                const response = await client.updateAccount(account.identity, data)
                account.attributes.status = status

                logger.info(account)
                res.send(account)
            }
        )
        .stdAccountEnable(
            async (context: Context, input: StdAccountEnableInput, res: Response<StdAccountEnableOutput>) => {
                logger.info('std:account:enable')
                logger.info(input)

                const status = 'Active'
                const account = await readAccount(input.identity)
                const data = {
                    eTag: account.attributes.eTag,
                    status,
                }
                const response = await client.updateAccount(account.identity, data)
                account.attributes.status = status

                logger.info(account)
                res.send(account)
            }
        )
        .stdAccountUpdate(
            async (context: Context, input: StdAccountUpdateInput, res: Response<StdAccountUpdateOutput>) => {
                logger.info('std:account:update')
                logger.info(input)
                for (let change of input.changes) {
                    const values = [].concat(change.value)
                    for (let value of values) {
                        const account = await readAccount(input.identity)
                        switch (change.op) {
                            case AttributeChangeOp.Add:
                                await assignUserRole(account, value)
                                break
                            case AttributeChangeOp.Remove:
                                await removeUserRole(account, value)
                                break
                            case AttributeChangeOp.Set:
                                await updateUser(account, change, value)
                                break
                            default:
                                throw new ConnectorError(`Operation not supported: ${change.op}`)
                        }
                    }
                }

                const account = await readAccount(input.identity)
                logger.info(account)
                res.send(account)
            }
        )
        .stdEntitlementList(async (context: Context, input: any, res: Response<StdEntitlementListOutput>) => {
            logger.info('std:entitlement:list')

            const response = await client.getRoles()
            for (const gr of response.data.filter((x: { isDeleted: string }) => !x.isDeleted)) {
                const group = new Group(gr)
                group.attributes.type = 'Role'

                logger.info(group)
                res.send(group)
            }

            const attributes = getProvisioningAttributes()
            for (const attribute of attributes) {
                const group = getGroupFromAttribute(attribute)

                logger.info(group)
                res.send(group)
            }

            for (const principalRole of principalRoles) {
                const group = getGroupFromPrincipalRole(principalRole)

                logger.info(group)
                res.send(group)
            }
        })
        .stdEntitlementRead(
            async (context: Context, input: StdEntitlementReadInput, res: Response<StdEntitlementReadOutput>) => {
                logger.info('std:entitlement:read')
                logger.info(input)

                let group: Group
                if (roleRegex.test(input.identity)) {
                    const response = await client.getRole(input.identity)
                    group = new Group(response.data)
                    group.attributes.type = 'Role'
                } else {
                    group = getGroupFromAttribute(input.identity)
                }

                logger.info(group)
                res.send(group)
            }
        )
}
