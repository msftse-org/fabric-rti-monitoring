# Separate Terraform state bootstrap

Use an existing approved Azure Storage backend when possible. This optional root
creates new **billable** state storage independently of the demonstration's
resource group and feature flags. It is not called by `infra/terraform/main.tf`.

The storage account uses Entra authentication with shared keys disabled, private
blobs, HTTPS/TLS 1.2, GRS replication, blob versioning, 30-day blob/container
soft delete, and a control-plane deletion lock. The current operator receives
Storage Blob Data Contributor at storage-account scope so it can create the
container. Subsequent runners need their own reviewed access grants.

An empty `allowed_ips` leaves an authenticated public endpoint (the account sets
`public_network_access = "Enabled"` explicitly because AzureRM 5.x otherwise
leaves it provider-computed). A configured allowlist restricts public access to
those IPs, with the Azure trusted-services exception. This is not a
private-endpoint deployment. If your tenant policy forces public access to
`Disabled`, this root cannot provide a reachable backend; see
[local state](../../docs/terraform-deployment.md#use-local-state-when-no-reachable-backend-exists).

See [backend setup](../../docs/terraform-deployment.md#2-configure-remote-state)
for the explicit plan/apply sequence, RBAC propagation considerations, and the
application backend output. The initial bootstrap state is local and sensitive;
retain it securely or migrate it deliberately to a **different** blob key from
the application state.

Deleting the demonstration must not delete its state storage. The Azure lock
blocks control-plane deletion but does not prevent an authorized data-plane
principal from modifying blobs. Versioning and soft delete provide separate
recovery controls.

Offline checks:

```bash
terraform -chdir=infra/terraform-state fmt -check -recursive
terraform -chdir=infra/terraform-state init -backend=false -input=false -lockfile=readonly
terraform -chdir=infra/terraform-state validate
terraform -chdir=infra/terraform-state test
tflint --chdir=infra/terraform-state
```
