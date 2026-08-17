import { IntegrationConnectionPanel } from "@/components/qm/IntegrationConnectionPanel";

export function AzureDevOpsConfig() {
  return (
    <IntegrationConnectionPanel
      provider="azure_devops"
      displayName="Azure DevOps"
      connectHint="Connect an Azure DevOps organization to sync work items and iterations into QualiMetrix"
    />
  );
}
