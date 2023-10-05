import { Attributes, StdAccountReadOutput } from '@sailpoint/connector-sdk'

export class Account {
    identity: string
    uuid: string
    attributes: Attributes

    constructor(object: any) {
        this.attributes = {
            identityId: object.identityId,
            firstName: object.firstName,
            lastName: object.lastName,
            displayName: object.displayName,
            description: object.description,
            email: object.email,
            secondaryEmail: object.privateData.secondaryEmail,
            phoneNumberPrimary: object.privateData.phoneNumberPrimary,
            countryCode: object.countryCode,
            status: object.status,
            employeeNumber: object.privateData.employeeNumber,
            departmentName: object.companyData.departmentName,
            jobTitle: object.companyData.jobTitle,
            companyName: object.companyData.companyName,
            provisioningAttributes: object.systemData.provisioningAttributes
                ? object.systemData.provisioningAttributes.map((x: { name: string }) => x.name)
                : [],
            eTag: object.eTag,
        }
        this.identity = this.attributes.identityId as string
        this.uuid = this.attributes.displayName as string
    }
}
