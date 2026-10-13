resource "google_discovery_engine_data_store" "kb" {
  location                    = "global"
  data_store_id               = var.vertex_search_datastore_id
  display_name                = "Kaizen Knowledge Store"
  industry_vertical           = "GENERIC"
  content_config              = "CONTENT_REQUIRED"
  solution_types              = ["SOLUTION_TYPE_SEARCH"]
  create_advanced_site_search = false

  depends_on = [time_sleep.apis_ready]
}

# Standard tier, no add-ons: the app requests snippets only (no LLM summaries).
resource "google_discovery_engine_search_engine" "kb" {
  engine_id         = var.vertex_search_engine_id
  collection_id     = "default_collection"
  location          = "global"
  display_name      = "Kaizen Knowledge Search"
  industry_vertical = "GENERIC"
  data_store_ids    = [google_discovery_engine_data_store.kb.data_store_id]

  search_engine_config {
    search_tier = "SEARCH_TIER_STANDARD"
  }

  depends_on = [time_sleep.apis_ready]
}
