// backend/src/modules/wheel-size/index.ts
import { Module } from "@medusajs/framework/utils"
import WheelSizeService from "./service"
export const WHEEL_SIZE_MODULE = "wheelSizeModuleService"
export default Module(WHEEL_SIZE_MODULE, { service: WheelSizeService })
