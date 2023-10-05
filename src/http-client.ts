import { ConnectorError, StdTestConnectionOutput } from '@sailpoint/connector-sdk'
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import { Group } from './model/group'
import { readConfig } from '@sailpoint/connector-sdk'

const envMap: { [x: string]: string } = {
    production: '',
    europe: '.eu',
    development: '-demo',
}

export class HTTPClient {
    private environment: string
    private accountId: string
    private clientId: string
    private clientSecret: string
    private provisioningAttributes: string
    private domain: string
    private accessToken?: string
    private expiryDate: Date
    private take = 100

    constructor(config: any) {
        this.environment = config.environment as string
        this.accountId = config.accountId
        this.clientId = config.clientId
        this.clientSecret = config.clientSecret
        this.provisioningAttributes = config.provisioningAttributes
        this.domain = 'clearid.io'
        this.expiryDate = new Date()
        if (config.ignoreSSL) {
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
        }
    }

    getEndpoint(service: string): string {
        let endpoint: string = ''
        const domain = this.domain
        const env = envMap[this.environment as keyof typeof envMap]
        switch (service) {
            case 'sts':
                endpoint = `https://sts${env}.${domain}`
                break
            case 'identity':
                endpoint = `https://identityservice${env}.${domain}/api/v2`
                break
            case 'search':
                endpoint = `https://searchservice${env}.${domain}/api/v1`
                break
            case 'role':
                endpoint = `https://roleservice${env}.${domain}/api/v3`
                break
            case 'principal':
                endpoint = `https://principalservice${env}.${domain}/api/v2`
                break
        }
        return endpoint
    }

    async getAccessToken(): Promise<string | undefined> {
        if (new Date() >= this.expiryDate) {
            const request: AxiosRequestConfig = {
                method: 'post',
                baseURL: this.getEndpoint('sts'),
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                data: `client_id=${this.clientId}&client_secret=${this.clientSecret}&grant_type=client_credentials`,
                url: '/connect/token',
            }
            const response: AxiosResponse = await axios(request)
            this.accessToken = response.data.access_token
            this.expiryDate = new Date()
            this.expiryDate.setSeconds(this.expiryDate.getSeconds() + response.data.expires_in)
        }

        return this.accessToken
    }

    async testConnection(): Promise<AxiosResponse> {
        const accessToken = await this.getAccessToken()

        let request: AxiosRequestConfig = {
            method: 'get',
            baseURL: this.getEndpoint('sts'),
            url: '/',
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        }

        return axios(request)
    }

    async getAccounts(): Promise<AxiosResponse> {
        const accessToken = await this.getAccessToken()

        let request: AxiosRequestConfig = {
            method: 'post',
            baseURL: this.getEndpoint('search'),
            url: `/accounts/${this.accountId}/identities`,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
            },
            data: {
                skip: 0,
                take: this.take,
            },
        }

        let data: any[] = []

        let response = await axios(request)
        const total = response.data.totalItems
        data = [...data, ...response.data.results]

        while (data.length < total) {
            request.data.skip = data.length
            response = await axios(request)
            data = [...data, ...response.data.results]
        }
        response.data = data
        return response
    }

    async getAccount(id: string): Promise<AxiosResponse> {
        const accessToken = await this.getAccessToken()

        let request: AxiosRequestConfig = {
            method: 'get',
            baseURL: this.getEndpoint('identity'),
            url: `/accounts/${this.accountId}/identities/${id}?&include=Ordinal&include=SystemData&include=PrivateData&include=CompanyData&include=NationalIdentityData&include=UserPermissions`,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
            },
        }

        let response = await axios(request)

        return response
    }

    async getRoles(): Promise<AxiosResponse> {
        const accessToken = await this.getAccessToken()

        let request: AxiosRequestConfig = {
            method: 'post',
            baseURL: this.getEndpoint('search'),
            url: `/accounts/${this.accountId}/teams`,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
            },
            data: {
                skip: 0,
                take: this.take,
            },
        }

        let data: any[] = []

        let response = await axios(request)
        const total = response.data.totalItems
        data = [...data, ...response.data.results]

        while (data.length < total) {
            request.data.skip = data.length
            response = await axios(request)
            data = [...data, ...response.data.results]
        }
        response.data = data
        return response
    }

    async getRole(id: string): Promise<AxiosResponse> {
        const accessToken = await this.getAccessToken()

        let request: AxiosRequestConfig = {
            method: 'get',
            baseURL: this.getEndpoint('role'),
            url: `/accounts/${this.accountId}/teams/${id}`,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
            },
        }

        let response = await axios(request)

        return response
    }

    async getUserRoles(id: string): Promise<AxiosResponse> {
        const accessToken = await this.getAccessToken()

        let request: AxiosRequestConfig = {
            method: 'get',
            baseURL: this.getEndpoint('role'),
            url: `/accounts/${this.accountId}/identities/${id}/teams`,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
            },
        }

        let response = await axios(request)

        return response
    }

    async removeUserRole(userId: string, roleId: string): Promise<AxiosResponse> {
        const accessToken = await this.getAccessToken()

        let request: AxiosRequestConfig = {
            method: 'delete',
            baseURL: this.getEndpoint('role'),
            url: `/accounts/${this.accountId}/teams/${roleId}/members`,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
            },
            data: {
                teamMembers: [
                    {
                        identityId: userId,
                        sourceId: 'TeamService',
                    },
                ],
                reason: 'IdentityNow',
            },
        }

        return await axios(request)
    }

    async assignUserRole(roleId: string, userId: string): Promise<AxiosResponse> {
        const accessToken = await this.getAccessToken()

        let request: AxiosRequestConfig = {
            method: 'post',
            baseURL: this.getEndpoint('role'),
            url: `/accounts/${this.accountId}/teams/${roleId}/members`,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
            },
            data: {
                identityIds: [userId],
                reason: 'IdentityNow',
                sourceId: 'TeamService',
            },
        }

        return await axios(request)
    }

    async createAccount(user: object): Promise<AxiosResponse> {
        const accessToken = await this.getAccessToken()

        let request: AxiosRequestConfig = {
            method: 'post',
            baseURL: this.getEndpoint('identity'),
            url: `/accounts/${this.accountId}/identities`,
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
            data: user,
        }

        return await axios(request)
    }

    async updateAccount(id: string, data: object): Promise<AxiosResponse> {
        const accessToken = await this.getAccessToken()

        let request: AxiosRequestConfig = {
            method: 'patch',
            baseURL: this.getEndpoint('identity'),
            url: `/accounts/${this.accountId}/identities/${id}`,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json-patch+json',
            },
            data,
        }

        return await axios(request)
    }

    async getIdentityPrincipal(id: string): Promise<AxiosResponse> {
        const accessToken = await this.getAccessToken()

        let request: AxiosRequestConfig = {
            method: 'get',
            baseURL: this.getEndpoint('principal'),
            url: `/accounts/${this.accountId}/identityPrincipals/${id}`,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
        }

        return await axios(request)
    }

    async assignUserPrincipal(id: string, principal: string, role: string): Promise<AxiosResponse> {
        const accessToken = await this.getAccessToken()

        let request: AxiosRequestConfig = {
            method: 'put',
            baseURL: this.getEndpoint('principal'),
            url: encodeURIComponent(`/accounts/${this.accountId}/userPrincipals/${principal}`),
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            data: {
                identityId: id,
                roles: [role],
                principalState: 'Active',
            },
        }

        return await axios(request)
    }

    async removeUserPrincipal(principal: string): Promise<AxiosResponse> {
        const accessToken = await this.getAccessToken()

        let request: AxiosRequestConfig = {
            method: 'delete',
            baseURL: this.getEndpoint('principal'),
            url: encodeURIComponent(`/accounts/${this.accountId}/userPrincipals/${principal}`),
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
        }

        return await axios(request)
    }
}
