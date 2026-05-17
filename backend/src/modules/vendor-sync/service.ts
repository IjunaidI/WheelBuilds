import { MedusaService } from "@medusajs/framework/utils"
import VendorFeedRun from "./models/vendor-feed-run"
import VendorFeedStaging from "./models/vendor-feed-staging"
import VendorStockStaging from "./models/vendor-stock-staging"
import VendorProductCurrent from "./models/vendor-product-current"

class VendorSyncService extends MedusaService({
  VendorFeedRun,
  VendorFeedStaging,
  VendorStockStaging,
  VendorProductCurrent,
}) {
  // Shell -- no custom methods in PR 1
}

export default VendorSyncService
