import { Module } from "@medusajs/framework/utils"
import VendorSyncService from "./service"

export const VENDOR_SYNC_MODULE = "vendorSyncModuleService"

export default Module(VENDOR_SYNC_MODULE, {
  service: VendorSyncService,
})
