import { Attributes, StdEntitlementReadOutput } from '@sailpoint/connector-sdk'

export class Group {
    identity: string
    uuid: string
    type: string = 'group'
    attributes: Attributes

    constructor(object: any) {
        this.attributes = {
            id: object.teamId,
            name: object.name,
            description: object.description,
            status: object.status,
        }
        this.identity = this.attributes.id as string
        this.uuid = this.attributes.name as string
    }
}
