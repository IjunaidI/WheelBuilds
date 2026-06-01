// backend/src/modules/customer-vehicle/service.ts
import { MedusaService } from "@medusajs/framework/utils"
import CustomerVehicle from "./models/customer-vehicle"

class CustomerVehicleService extends MedusaService({ CustomerVehicle }) {
  async activate(id: string, customerId: string): Promise<void> {
    const active = await this.listCustomerVehicles({ customer_id: customerId, is_active: true })
    for (const v of active) {
      if (v.id !== id) await this.updateCustomerVehicles({ id: v.id, is_active: false })
    }
    await this.updateCustomerVehicles({ id, is_active: true })
  }
}
export default CustomerVehicleService
