import { Module } from "@medusajs/framework/utils"
import SupportRequestService from "./service"

export const SUPPORT_REQUEST_MODULE = "supportRequestModuleService"
export default Module(SUPPORT_REQUEST_MODULE, { service: SupportRequestService })
