import { IntegrationConnectionPanel } from "@/components/qm/IntegrationConnectionPanel";

export function JiraConfig() {
  return (
    <IntegrationConnectionPanel
      provider="jira"
      displayName="Jira Cloud"
      connectHint="Connect a Jira Cloud site to sync issues and sprints into QualiMetrix"
    />
  );
}
