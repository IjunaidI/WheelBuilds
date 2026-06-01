// backend/src/modules/customer-vehicle/index.ts
import { Module } from "@medusajs/framework/utils"
import CustomerVehicleService from "./service"
export const CUSTOMER_VEHICLE_MODULE = "customerVehicleModuleService"
export default Module(CUSTOMER_VEHICLE_MODULE, { service: CustomerVehicleService })
