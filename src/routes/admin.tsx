import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/qm/AppShell";
import { useState, useEffect } from "react";
import { CheckCircle2, CircleDashed, Users, Settings, CreditCard, Shield, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Configuration — Enterprise Setup | QualiMetrix" },
      {
        name: "description",
        content:
          "Configure your QualiMetrix enterprise deployment. Import users, setup teams, configure budgets, and manage organization settings.",
      },
      { property: "og:title", content: "QualiMetrix Admin Configuration" },
      {
        property: "og:description",
        content: "Enterprise configuration and user management for QualiMetrix",
      },
    ],
  }),
  component: AdminPanel,
});

interface ConfigStatus {
  organizationConfigured: boolean;
  userCount: number;
  maxUsers: number;
  subscriptionTier: string;
  productsConfigured: number;
  aiUsageEvents: number;
}

interface SetupStep {
  step: string;
  completed: boolean;
  required: boolean;
}

interface SetupProgress {
  percentage: number;
  completedRequired: number;
  totalRequired: number;
  isComplete: boolean;
}

interface ConfigData {
  stats: ConfigStatus;
  setupSteps: SetupStep[];
  setupProgress: SetupProgress;
  readyForUsers: boolean;
}

function AdminPanel() {
  const [configData, setConfigData] = useState<ConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'teams' | 'budget'>('overview');

  useEffect(() => {
    fetchConfigurationStatus();
  }, []);

  const fetchConfigurationStatus = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/v1/admin/configuration-status');
      const data = await response.json();
      if (data.success) {
        setConfigData(data.data);
      }
    } catch (error) {
      console.error('Error fetching configuration status:', error);
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'overview' as const, label: 'Overview', icon: Settings },
    { id: 'users' as const, label: 'Users', icon: Users },
    { id: 'teams' as const, label: 'Teams', icon: Shield },
    { id: 'budget' as const, label: 'Budget', icon: CreditCard },
  ];

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading configuration...</p>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Enterprise Configuration</h1>
          <p className="text-muted-foreground">
            Configure your QualiMetrix deployment for {configData?.stats.maxUsers || 100}+ users
          </p>
        </div>

        {/* Progress Overview */}
        {configData && (
          <div className="mb-8 p-6 bg-card rounded-lg border border-border">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold">Setup Progress</h2>
                <p className="text-sm text-muted-foreground">
                  {configData.setupProgress.percentage}% complete
                </p>
              </div>
              {configData.setupProgress.isComplete && (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="text-sm font-medium">Ready for Users</span>
                </div>
              )}
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-muted rounded-full h-3 mb-4">
              <div
                className="bg-primary h-3 rounded-full transition-all duration-300"
                style={{ width: `${configData.setupProgress.percentage}%` }}
              />
            </div>

            {/* Setup Steps */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {configData.setupSteps.map((step, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background"
                >
                  {step.completed ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                  ) : (
                    <CircleDashed className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-medium">{step.step}</p>
                    <p className="text-xs text-muted-foreground">
                      {step.required ? 'Required' : 'Optional'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-border">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                <ChevronRight className="h-4 w-4" />
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="space-y-6">
          {activeTab === 'overview' && <OverviewTab configData={configData} />}
          {activeTab === 'users' && <UsersTab onUpdate={fetchConfigurationStatus} />}
          {activeTab === 'teams' && <TeamsTab onUpdate={fetchConfigurationStatus} />}
          {activeTab === 'budget' && <BudgetTab onUpdate={fetchConfigurationStatus} />}
        </div>
      </div>
    </AppShell>
  );
}

// Overview Tab Component
function OverviewTab({ configData }: { configData: ConfigData | null }) {
  if (!configData) return null;

  const stats = [
    { label: 'Organization Status', value: configData.stats.organizationConfigured ? 'Configured' : 'Not Configured', color: configData.stats.organizationConfigured ? 'text-green-600' : 'text-amber-600' },
    { label: 'Users', value: `${configData.stats.userCount} / ${configData.stats.maxUsers}`, color: 'text-foreground' },
    { label: 'Subscription Tier', value: configData.stats.subscriptionTier, color: 'text-primary' },
    { label: 'Products', value: configData.stats.productsConfigured.toString(), color: 'text-foreground' },
    { label: 'AI Usage Events', value: configData.stats.aiUsageEvents.toString(), color: 'text-foreground' },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {stats.map((stat, index) => (
        <div key={index} className="p-6 bg-card rounded-lg border border-border">
          <p className="text-sm text-muted-foreground mb-1">{stat.label}</p>
          <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
        </div>
      ))}
    </div>
  );
}

// Users Tab Component
function UsersTab({ onUpdate }: { onUpdate: () => void }) {
  const [userEmails, setUserEmails] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

  const handleBulkImport = async () => {
    setImporting(true);
    setImportResult(null);

    const lines = userEmails.split('\n').filter(line => line.trim());
    const users = lines.map(line => {
      const [email, name, role, team] = line.split(',').map(s => s.trim());
      return { email, name: name || email.split('@')[0], role: role || 'developer', team: team || 'Default Squad' };
    });

    try {
      const response = await fetch('http://localhost:3001/api/v1/admin/users/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users, method: 'csv' })
      });

      const data = await response.json();
      if (data.success) {
        setImportResult(data.data);
        setUserEmails('');
        onUpdate();
      }
    } catch (error) {
      console.error('Error importing users:', error);
      setImportResult({ error: 'Failed to import users' });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-6 bg-card rounded-lg border border-border">
        <h3 className="text-lg font-semibold mb-4">Bulk User Import</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Import multiple users at once. Format: email,name,role,team (one per line)
        </p>

        <textarea
          value={userEmails}
          onChange={(e) => setUserEmails(e.target.value)}
          placeholder="john.smith@company.com,John Smith,developer,Squad Nova&#10;jane.doe@company.com,Jane Doe,tester,Squad Kite"
          className="w-full h-40 p-3 border border-border rounded-lg bg-background font-mono text-sm mb-4"
        />

        <button
          onClick={handleBulkImport}
          disabled={importing || !userEmails.trim()}
          className="w-full bg-primary text-primary-foreground py-2 px-4 rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {importing ? 'Importing Users...' : 'Import Users'}
        </button>

        {importResult && (
          <div className={`mt-4 p-4 rounded-lg ${importResult.error ? 'bg-red-50 text-red-900' : 'bg-green-50 text-green-900'}`}>
            {importResult.error ? (
              <p>Error: {importResult.error}</p>
            ) : (
              <div>
                <p className="font-semibold mb-2">Import Results:</p>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div><span className="font-semibold">Total:</span> {importResult.summary.total}</div>
                  <div><span className="font-semibold">Successful:</span> {importResult.summary.successful}</div>
                  <div><span className="font-semibold">Failed:</span> {importResult.summary.failed}</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Teams Tab Component
function TeamsTab({ onUpdate }: { onUpdate: () => void }) {
  const [teamName, setTeamName] = useState('');
  const [teamBudget, setTeamBudget] = useState('4000');
  const [teamLead, setTeamLead] = useState('');
  const [configuring, setConfiguring] = useState(false);

  const handleConfigureTeam = async () => {
    setConfiguring(true);

    try {
      const response = await fetch('http://localhost:3001/api/v1/admin/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teams: [{ name: teamName, budget: parseInt(teamBudget), lead: teamLead, members: [] }]
        })
      });

      const data = await response.json();
      if (data.success) {
        setTeamName('');
        setTeamBudget('4000');
        setTeamLead('');
        onUpdate();
      }
    } catch (error) {
      console.error('Error configuring team:', error);
    } finally {
      setConfiguring(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-6 bg-card rounded-lg border border-border">
        <h3 className="text-lg font-semibold mb-4">Configure Teams</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Team Name</label>
            <input
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="Squad Nova"
              className="w-full p-2 border border-border rounded-lg bg-background"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Budget (USD)</label>
            <input
              type="number"
              value={teamBudget}
              onChange={(e) => setTeamBudget(e.target.value)}
              placeholder="4000"
              className="w-full p-2 border border-border rounded-lg bg-background"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Team Lead Email</label>
            <input
              type="email"
              value={teamLead}
              onChange={(e) => setTeamLead(e.target.value)}
              placeholder="john.smith@company.com"
              className="w-full p-2 border border-border rounded-lg bg-background"
            />
          </div>

          <button
            onClick={handleConfigureTeam}
            disabled={configuring || !teamName || !teamLead}
            className="w-full bg-primary text-primary-foreground py-2 px-4 rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {configuring ? 'Configuring Team...' : 'Configure Team'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Budget Tab Component
function BudgetTab({ onUpdate }: { onUpdate: () => void }) {
  const [orgBudget, setOrgBudget] = useState('3200');
  const [seatBudget, setSeatBudget] = useState('400');
  const [saving, setSaving] = useState(false);

  const handleSaveBudget = async () => {
    setSaving(true);

    try {
      const response = await fetch('http://localhost:3001/api/v1/admin/budget-configuration', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgSprintBudget: parseInt(orgBudget),
          defaultSeatBudget: parseInt(seatBudget),
          alertThresholds: {
            warning: 75,
            critical: 90
          }
        })
      });

      const data = await response.json();
      if (data.success) {
        console.log('Budget configuration saved:', data.data);
        onUpdate();
      } else {
        console.error('Failed to save budget configuration:', data.error);
      }
    } catch (error) {
      console.error('Error saving budget:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-6 bg-card rounded-lg border border-border">
        <h3 className="text-lg font-semibold mb-4">Budget Configuration</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Organization Sprint Budget (USD)</label>
            <input
              type="number"
              value={orgBudget}
              onChange={(e) => setOrgBudget(e.target.value)}
              placeholder="3200"
              className="w-full p-2 border border-border rounded-lg bg-background"
            />
            <p className="text-xs text-muted-foreground mt-1">Total AI budget for all teams per sprint</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Default Seat Budget (USD)</label>
            <input
              type="number"
              value={seatBudget}
              onChange={(e) => setSeatBudget(e.target.value)}
              placeholder="400"
              className="w-full p-2 border border-border rounded-lg bg-background"
            />
            <p className="text-xs text-muted-foreground mt-1">Default monthly AI budget per user</p>
          </div>

          <button
            onClick={handleSaveBudget}
            disabled={saving}
            className="w-full bg-primary text-primary-foreground py-2 px-4 rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving Configuration...' : 'Save Budget Configuration'}
          </button>
        </div>
      </div>
    </div>
  );
}