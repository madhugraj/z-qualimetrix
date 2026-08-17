import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/qm/AppShell";
import { useState, useEffect } from "react";
import { CheckCircle2, CircleDashed, ArrowRight, ArrowLeft, Building, Users, Shield, CreditCard, Sparkles } from "lucide-react";

export const Route = createFileRoute("/setup")({
  head: () => ({
    meta: [
      { title: "Setup Wizard — Enterprise Configuration | QualiMetrix" },
      {
        name: "description",
        content:
          "Get your QualiMetrix enterprise deployment configured in minutes. Setup organization, import users, configure teams and budgets.",
      },
      { property: "og:title", content: "QualiMetrix Setup Wizard" },
      {
        property: "og:description",
        content: "Step-by-step enterprise configuration wizard for QualiMetrix",
      },
    ],
  }),
  component: SetupWizard,
});

type SetupStep = 'welcome' | 'organization' | 'users' | 'teams' | 'budget' | 'complete';

interface SetupData {
  organizationName: string;
  domain: string;
  timezone: string;
  adminUser: {
    email: string;
    name: string;
    password: string;
  };
  tenantId: string;
  users: string;
  teams: Array<{
    name: string;
    budget: number;
    lead: string;
  }>;
  budget: {
    orgSprintBudget: number;
    defaultSeatBudget: number;
  };
}

function SetupWizard() {
  const [currentStep, setCurrentStep] = useState<SetupStep>('welcome');
  const [setupData, setSetupData] = useState<SetupData>({
    organizationName: '',
    domain: '',
    timezone: 'UTC',
    adminUser: {
      email: '',
      name: '',
      password: ''
    },
    tenantId: '',
    users: '',
    teams: [],
    budget: {
      orgSprintBudget: 3200,
      defaultSeatBudget: 400
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const steps: Array<{ id: SetupStep; title: string; icon: any; completed: boolean }> = [
    { id: 'welcome', title: 'Welcome', icon: Sparkles, completed: false },
    { id: 'organization', title: 'Organization', icon: Building, completed: false },
    { id: 'users', title: 'Users', icon: Users, completed: false },
    { id: 'teams', title: 'Teams', icon: Shield, completed: false },
    { id: 'budget', title: 'Budget', icon: CreditCard, completed: false },
    { id: 'complete', title: 'Complete', icon: CheckCircle2, completed: false },
  ];

  const currentStepIndex = steps.findIndex(step => step.id === currentStep);

  const updateSetupData = (updates: Partial<SetupData>) => {
    setSetupData(prev => ({ ...prev, ...updates }));
  };

  const handleNext = async () => {
    setError('');

    if (currentStep === 'organization') {
      await handleOrganizationSetup();
    } else if (currentStep === 'users') {
      await handleUserImport();
    } else if (currentStep === 'teams') {
      await handleTeamSetup();
    } else if (currentStep === 'budget') {
      await handleBudgetSetup();
    } else {
      goToNextStep();
    }
  };

  const goToNextStep = () => {
    const stepOrder: SetupStep[] = ['welcome', 'organization', 'users', 'teams', 'budget', 'complete'];
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex < stepOrder.length - 1) {
      setCurrentStep(stepOrder[currentIndex + 1]);
    }
  };

  const handlePrevious = () => {
    const stepOrder: SetupStep[] = ['welcome', 'organization', 'users', 'teams', 'budget', 'complete'];
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(stepOrder[currentIndex - 1]);
    }
  };

  const handleOrganizationSetup = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:3001/api/v1/admin/setup-organization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationName: setupData.organizationName,
          domain: setupData.domain,
          timezone: setupData.timezone,
          adminUser: setupData.adminUser,
          budgetSettings: setupData.budget
        })
      });

      const data = await response.json();
      if (data.success) {
        updateSetupData({ tenantId: data.data.tenant.id });
        goToNextStep();
      } else {
        setError(data.error || 'Failed to setup organization');
      }
    } catch (err) {
      setError('Failed to connect to server. Please ensure the API is running.');
    } finally {
      setLoading(false);
    }
  };

  const handleUserImport = async () => {
    setLoading(true);
    try {
      const lines = setupData.users.split('\n').filter(line => line.trim());
      const users = lines.map(line => {
        const [email, name, role, team] = line.split(',').map(s => s.trim());
        return { email, name: name || email.split('@')[0], role: role || 'developer', team: team || 'Default Squad' };
      });

      if (users.length > 0) {
        const response = await fetch('http://localhost:3001/api/v1/admin/users/bulk-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ users, method: 'csv', tenantId: setupData.tenantId })
        });

        const data = await response.json();
        if (!data.success) {
          setError(data.error || 'Failed to import users');
          return;
        }
      }

      goToNextStep();
    } catch (err) {
      setError('Failed to import users');
    } finally {
      setLoading(false);
    }
  };

  const handleTeamSetup = async () => {
    setLoading(true);
    try {
      if (setupData.teams.length > 0) {
        const response = await fetch('http://localhost:3001/api/v1/admin/teams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teams: setupData.teams })
        });

        const data = await response.json();
        if (!data.success) {
          setError(data.error || 'Failed to configure teams');
          return;
        }
      }

      goToNextStep();
    } catch (err) {
      setError('Failed to configure teams');
    } finally {
      setLoading(false);
    }
  };

  const handleBudgetSetup = async () => {
    setLoading(true);
    try {
      // Budget would be saved here when the endpoint is implemented
      goToNextStep();
    } catch (err) {
      setError('Failed to save budget configuration');
    } finally {
      setLoading(false);
    }
  };

  const isCurrentStepValid = () => {
    switch (currentStep) {
      case 'organization':
        return setupData.organizationName && setupData.adminUser.email && setupData.adminUser.password.length >= 8;
      case 'users':
        return true; // Users are optional
      case 'teams':
        return true; // Teams are optional
      case 'budget':
        return setupData.budget.orgSprintBudget > 0;
      default:
        return true;
    }
  };

  return (
    <AppShell>
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-4xl">
          {/* Progress Steps */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              {steps.map((step, index) => {
                const Icon = step.icon;
                const isCompleted = index < currentStepIndex;
                const isCurrent = index === currentStepIndex;

                return (
                  <div key={step.id} className="flex items-center flex-1">
                    <div className="flex flex-col items-center flex-1">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${
                          isCompleted
                            ? 'bg-green-500 text-white'
                            : isCurrent
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-gray-200 text-gray-500'
                        }`}
                      >
                        {isCompleted ? (
                          <CheckCircle2 className="h-5 w-5" />
                        ) : (
                          <Icon className="h-5 w-5" />
                        )}
                      </div>
                      <span className="text-xs text-center">{step.title}</span>
                    </div>
                    {index < steps.length - 1 && (
                      <div
                        className={`flex-1 h-1 mx-2 ${
                          index < currentStepIndex ? 'bg-green-500' : 'bg-gray-200'
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Step Content */}
          <div className="bg-card rounded-lg border border-border p-8">
            {error && (
              <div className="mb-6 p-4 bg-red-50 text-red-900 rounded-lg">
                {error}
              </div>
            )}

            {currentStep === 'welcome' && <WelcomeStep onNext={goToNextStep} />}
            {currentStep === 'organization' && (
              <OrganizationStep
                data={setupData}
                onUpdate={updateSetupData}
                onNext={handleNext}
                onPrevious={handlePrevious}
                loading={loading}
                isValid={isCurrentStepValid()}
              />
            )}
            {currentStep === 'users' && (
              <UsersStep
                data={setupData}
                onUpdate={updateSetupData}
                onNext={handleNext}
                onPrevious={handlePrevious}
                loading={loading}
              />
            )}
            {currentStep === 'teams' && (
              <TeamsStep
                data={setupData}
                onUpdate={updateSetupData}
                onNext={handleNext}
                onPrevious={handlePrevious}
                loading={loading}
              />
            )}
            {currentStep === 'budget' && (
              <BudgetStep
                data={setupData}
                onUpdate={updateSetupData}
                onNext={handleNext}
                onPrevious={handlePrevious}
                loading={loading}
                isValid={isCurrentStepValid()}
              />
            )}
            {currentStep === 'complete' && <CompleteStep />}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// Welcome Step
function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center">
      <Sparkles className="h-16 w-16 text-primary mx-auto mb-4" />
      <h1 className="text-3xl font-bold mb-4">Welcome to QualiMetrix</h1>
      <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
        Let's get your enterprise AI usage analytics configured in just a few minutes.
        We'll guide you through setting up your organization, importing users, and configuring teams.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 text-left">
        <div className="p-4 border border-border rounded-lg">
          <Building className="h-8 w-8 text-primary mb-2" />
          <h3 className="font-semibold mb-1">Organization Setup</h3>
          <p className="text-sm text-muted-foreground">Configure your organization settings and admin user</p>
        </div>
        <div className="p-4 border border-border rounded-lg">
          <Users className="h-8 w-8 text-primary mb-2" />
          <h3 className="font-semibold mb-1">User Import</h3>
          <p className="text-sm text-muted-foreground">Bulk import your team members and assign roles</p>
        </div>
        <div className="p-4 border border-border rounded-lg">
          <Shield className="h-8 w-8 text-primary mb-2" />
          <h3 className="font-semibold mb-1">Teams & Budget</h3>
          <p className="text-sm text-muted-foreground">Configure squads and AI usage budgets</p>
        </div>
      </div>

      <button
        onClick={onNext}
        className="bg-primary text-primary-foreground py-3 px-8 rounded-lg hover:opacity-90 transition-colors font-medium"
      >
        Get Started <ArrowRight className="inline ml-2 h-4 w-4" />
      </button>
    </div>
  );
}

// Organization Step
function OrganizationStep({
  data,
  onUpdate,
  onNext,
  onPrevious,
  loading,
  isValid
}: {
  data: SetupData;
  onUpdate: (updates: Partial<SetupData>) => void;
  onNext: () => void;
  onPrevious: () => void;
  loading: boolean;
  isValid: boolean;
}) {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Organization Setup</h2>
      <p className="text-muted-foreground mb-6">Configure your organization details and admin user</p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Organization Name *</label>
          <input
            type="text"
            value={data.organizationName}
            onChange={(e) => onUpdate({ organizationName: e.target.value })}
            placeholder="My Company"
            className="w-full p-3 border border-border rounded-lg bg-background"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Domain (Optional)</label>
          <input
            type="text"
            value={data.domain}
            onChange={(e) => onUpdate({ domain: e.target.value })}
            placeholder="company.com"
            className="w-full p-3 border border-border rounded-lg bg-background"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Admin User Email *</label>
          <input
            type="email"
            value={data.adminUser.email}
            onChange={(e) => onUpdate({ adminUser: { ...data.adminUser, email: e.target.value } })}
            placeholder="admin@company.com"
            className="w-full p-3 border border-border rounded-lg bg-background"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Admin User Name</label>
          <input
            type="text"
            value={data.adminUser.name}
            onChange={(e) => onUpdate({ adminUser: { ...data.adminUser, name: e.target.value } })}
            placeholder="System Administrator"
            className="w-full p-3 border border-border rounded-lg bg-background"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Admin Password *</label>
          <input
            type="password"
            autoComplete="new-password"
            value={data.adminUser.password}
            onChange={(e) => onUpdate({ adminUser: { ...data.adminUser, password: e.target.value } })}
            placeholder="At least 8 characters"
            className="w-full p-3 border border-border rounded-lg bg-background"
          />
        </div>
      </div>

      <div className="flex justify-between mt-8">
        <button
          onClick={onPrevious}
          disabled={loading}
          className="py-2 px-4 border border-border rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          <ArrowLeft className="inline mr-2 h-4 w-4" />
          Previous
        </button>
        <button
          onClick={onNext}
          disabled={loading || !isValid}
          className="bg-primary text-primary-foreground py-2 px-6 rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Setting up...' : 'Next'}
          <ArrowRight className="inline ml-2 h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// Users Step
function UsersStep({
  data,
  onUpdate,
  onNext,
  onPrevious,
  loading
}: {
  data: SetupData;
  onUpdate: (updates: Partial<SetupData>) => void;
  onNext: () => void;
  onPrevious: () => void;
  loading: boolean;
}) {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Import Users</h2>
      <p className="text-muted-foreground mb-6">Import your team members (optional - you can skip this step)</p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            User List <span className="text-muted-foreground">(email,name,role,team - one per line)</span>
          </label>
          <textarea
            value={data.users}
            onChange={(e) => onUpdate({ users: e.target.value })}
            placeholder="john.smith@company.com,John Smith,developer,Squad Nova&#10;jane.doe@company.com,Jane Doe,tester,Squad Kite"
            className="w-full h-48 p-3 border border-border rounded-lg bg-background font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Leave empty to skip user import and add users later
          </p>
        </div>
      </div>

      <div className="flex justify-between mt-8">
        <button
          onClick={onPrevious}
          disabled={loading}
          className="py-2 px-4 border border-border rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          <ArrowLeft className="inline mr-2 h-4 w-4" />
          Previous
        </button>
        <button
          onClick={onNext}
          disabled={loading}
          className="bg-primary text-primary-foreground py-2 px-6 rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Importing...' : 'Next'}
          <ArrowRight className="inline ml-2 h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// Teams Step
function TeamsStep({
  data,
  onUpdate,
  onNext,
  onPrevious,
  loading
}: {
  data: SetupData;
  onUpdate: (updates: Partial<SetupData>) => void;
  onNext: () => void;
  onPrevious: () => void;
  loading: boolean;
}) {
  const [newTeam, setNewTeam] = useState({ name: '', budget: 4000, lead: '' });

  const addTeam = () => {
    if (newTeam.name && newTeam.lead) {
      onUpdate({
        teams: [...data.teams, { ...newTeam, budget: Number(newTeam.budget) }]
      });
      setNewTeam({ name: '', budget: 4000, lead: '' });
    }
  };

  const removeTeam = (index: number) => {
    onUpdate({
      teams: data.teams.filter((_, i) => i !== index)
    });
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Configure Teams</h2>
      <p className="text-muted-foreground mb-6">Set up your squads and assign budgets (optional)</p>

      <div className="space-y-4">
        {/* Existing Teams */}
        {data.teams.length > 0 && (
          <div className="space-y-2">
            <h3 className="font-medium">Teams Added:</h3>
            {data.teams.map((team, index) => (
              <div key={index} className="flex items-center justify-between p-3 border border-border rounded-lg">
                <div>
                  <div className="font-medium">{team.name}</div>
                  <div className="text-sm text-muted-foreground">
                    Budget: ${team.budget} | Lead: {team.lead}
                  </div>
                </div>
                <button
                  onClick={() => removeTeam(index)}
                  className="text-red-600 hover:text-red-800 text-sm"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add New Team */}
        <div className="border-t border-border pt-4">
          <h3 className="font-medium mb-3">Add Team:</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              type="text"
              value={newTeam.name}
              onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })}
              placeholder="Team Name"
              className="p-2 border border-border rounded-lg bg-background"
            />
            <input
              type="number"
              value={newTeam.budget}
              onChange={(e) => setNewTeam({ ...newTeam, budget: Number(e.target.value) })}
              placeholder="Budget"
              className="p-2 border border-border rounded-lg bg-background"
            />
            <input
              type="email"
              value={newTeam.lead}
              onChange={(e) => setNewTeam({ ...newTeam, lead: e.target.value })}
              placeholder="Lead Email"
              className="p-2 border border-border rounded-lg bg-background"
            />
          </div>
          <button
            onClick={addTeam}
            disabled={!newTeam.name || !newTeam.lead}
            className="mt-3 text-sm text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + Add Team
          </button>
        </div>
      </div>

      <div className="flex justify-between mt-8">
        <button
          onClick={onPrevious}
          disabled={loading}
          className="py-2 px-4 border border-border rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          <ArrowLeft className="inline mr-2 h-4 w-4" />
          Previous
        </button>
        <button
          onClick={onNext}
          disabled={loading}
          className="bg-primary text-primary-foreground py-2 px-6 rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Configuring...' : 'Next'}
          <ArrowRight className="inline ml-2 h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// Budget Step
function BudgetStep({
  data,
  onUpdate,
  onNext,
  onPrevious,
  loading,
  isValid
}: {
  data: SetupData;
  onUpdate: (updates: Partial<SetupData>) => void;
  onNext: () => void;
  onPrevious: () => void;
  loading: boolean;
  isValid: boolean;
}) {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Budget Configuration</h2>
      <p className="text-muted-foreground mb-6">Set up AI usage budgets for your organization</p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Organization Sprint Budget (USD)</label>
          <input
            type="number"
            value={data.budget.orgSprintBudget}
            onChange={(e) => onUpdate({ budget: { ...data.budget, orgSprintBudget: Number(e.target.value) } })}
            placeholder="3200"
            className="w-full p-3 border border-border rounded-lg bg-background"
          />
          <p className="text-xs text-muted-foreground mt-1">Total AI budget for all teams per sprint</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Default Seat Budget (USD)</label>
          <input
            type="number"
            value={data.budget.defaultSeatBudget}
            onChange={(e) => onUpdate({ budget: { ...data.budget, defaultSeatBudget: Number(e.target.value) } })}
            placeholder="400"
            className="w-full p-3 border border-border rounded-lg bg-background"
          />
          <p className="text-xs text-muted-foreground mt-1">Default monthly AI budget per user</p>
        </div>
      </div>

      <div className="flex justify-between mt-8">
        <button
          onClick={onPrevious}
          disabled={loading}
          className="py-2 px-4 border border-border rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          <ArrowLeft className="inline mr-2 h-4 w-4" />
          Previous
        </button>
        <button
          onClick={onNext}
          disabled={loading || !isValid}
          className="bg-primary text-primary-foreground py-2 px-6 rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Completing Setup...' : 'Complete Setup'}
          <ArrowRight className="inline ml-2 h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// Complete Step
function CompleteStep() {
  return (
    <div className="text-center">
      <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
      <h1 className="text-3xl font-bold mb-4">Setup Complete!</h1>
      <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
        Your QualiMetrix enterprise deployment is now configured. You can start tracking AI usage
        across your organization immediately.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 text-left">
        <div className="p-4 border border-border rounded-lg">
          <h3 className="font-semibold mb-2">📊 View Analytics Dashboard</h3>
          <p className="text-sm text-muted-foreground mb-3">
            Monitor AI usage, costs, and trends across your organization
          </p>
          <Link
            to="/ai-usage"
            className="text-primary hover:underline text-sm"
          >
            Go to Dashboard →
          </Link>
        </div>

        <div className="p-4 border border-border rounded-lg">
          <h3 className="font-semibold mb-2">⚙️ Admin Configuration</h3>
          <p className="text-sm text-muted-foreground mb-3">
            Manage users, teams, and configure additional settings
          </p>
          <Link
            to="/admin"
            className="text-primary hover:underline text-sm"
          >
            Go to Admin Panel →
          </Link>
        </div>
      </div>

      <div className="bg-blue-50 p-4 rounded-lg text-left">
        <h3 className="font-semibold mb-2">🚀 Next Steps</h3>
        <ul className="text-sm space-y-1">
          <li>• Share the platform URL with your team members</li>
          <li>• Configure IDE plugins to start tracking AI usage</li>
          <li>• Set up team-specific budgets and alerts</li>
          <li>• Explore the analytics dashboard</li>
        </ul>
      </div>
    </div>
  );
}