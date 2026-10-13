data "google_project" "this" {}

# Alert-only: GCP budgets never stop spending. EXCLUDE_ALL_CREDITS tracks gross spend,
# i.e. how fast the free-trial credit burns. No all_updates_rule: without one, alerts are
# emailed to the billing account admins (the provider rejects the block unless a Pub/Sub
# topic or monitoring channel is set).
resource "google_billing_budget" "project" {
  count = var.billing_account_id == null ? 0 : 1

  billing_account = var.billing_account_id
  display_name    = "Kaizen Agent ${var.project_id}"

  budget_filter {
    projects               = ["projects/${data.google_project.this.number}"]
    credit_types_treatment = "EXCLUDE_ALL_CREDITS"
  }

  amount {
    specified_amount {
      currency_code = var.budget_currency
      units         = tostring(var.budget_amount)
    }
  }

  threshold_rules {
    threshold_percent = 0.5
    spend_basis       = "CURRENT_SPEND"
  }

  threshold_rules {
    threshold_percent = 0.9
    spend_basis       = "CURRENT_SPEND"
  }

  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "CURRENT_SPEND"
  }

  depends_on = [google_project_service.apis]
}
