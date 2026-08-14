import { useState, useEffect } from 'react';
import { Users, TrendingUp, AlertTriangle, CheckCircle2, CircleDashed, Loader2, Zap } from 'lucide-react';
import { GlassPanel } from '@/components/qm/GlassPanel';
import { CircularProgress } from '@/components/qm/CircularProgress';

interface TeamMember {
  id: string;
  name: string;
  role: string;
  velocity: number;
  completedTasks: number;
  activeTasks: number;
  efficiency: number;
  avatar?: string;
}

interface TeamPerformanceData {
  overallVelocity: number;
  teamSize: number;
  totalCompleted: number;
  totalActive: number;
  avgEfficiency: number;
  trend: 'up' | 'down' | 'stable';
  members: TeamMember[];
  workloadDistribution: {
    balanced: number;
    overloaded: number;
    underutilized: number;
  };
}

interface TeamPerformanceMetricsProps {
  productId: string;
  tenantId: string;
}

export function TeamPerformanceMetrics({ productId, tenantId }: TeamPerformanceMetricsProps) {
  const [teamData, setTeamData] = useState<TeamPerformanceData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadTeamPerformance();
  }, [productId, tenantId]);

  const loadTeamPerformance = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`http://localhost:3001/api/v1/analytics/team-performance?productId=${productId}&tenantId=${tenantId}`);
      const data = await response.json();

      if (data.success) {
        setTeamData(data.data);
      } else {
        // Use mock data for demo
        setTeamData(generateMockTeamData());
      }
    } catch (error) {
      console.error('Failed to load team performance:', error);
      // Use mock data for demo
      setTeamData(generateMockTeamData());
    } finally {
      setIsLoading(false);
    }
  };

  const generateMockTeamData = (): TeamPerformanceData => ({
    overallVelocity: 87,
    teamSize: 8,
    totalCompleted: 156,
    totalActive: 23,
    avgEfficiency: 82,
    trend: 'up',
    members: [
      { id: '1', name: 'Alice Chen', role: 'Senior Developer', velocity: 92, completedTasks: 24, activeTasks: 3, efficiency: 94 },
      { id: '2', name: 'Bob Smith', role: 'Full Stack Developer', velocity: 85, completedTasks: 18, activeTasks: 4, efficiency: 88 },
      { id: '3', name: 'Carol Johnson', role: 'Frontend Developer', velocity: 78, completedTasks: 15, activeTasks: 5, efficiency: 82 },
      { id: '4', name: 'David Lee', role: 'Backend Developer', velocity: 91, completedTasks: 22, activeTasks: 2, efficiency: 90 },
      { id: '5', name: 'Eva Martinez', role: 'QA Engineer', velocity: 88, completedTasks: 20, activeTasks: 3, efficiency: 86 },
      { id: '6', name: 'Frank Wilson', role: 'DevOps Engineer', velocity: 95, completedTasks: 25, activeTasks: 1, efficiency: 96 },
      { id: '7', name: 'Grace Kim', role: 'Junior Developer', velocity: 72, completedTasks: 12, activeTasks: 6, efficiency: 75 },
      { id: '8', name: 'Henry Davis', role: 'Tech Lead', velocity: 89, completedTasks: 20, activeTasks: 3, efficiency: 92 },
    ],
    workloadDistribution: {
      balanced: 5,
      overloaded: 2,
      underutilized: 1
    }
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!teamData) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Unable to load team performance data
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Team Overview */}
      <GlassPanel
        title="Team Performance Overview"
        subtitle="Velocity, efficiency, and workload distribution across the team"
        className="xl:col-span-2"
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div className="text-center">
            <p className="text-2xl font-semibold">{teamData.overallVelocity}</p>
            <p className="text-xs text-muted-foreground">Team Velocity</p>
            <div className="flex items-center justify-center gap-1 mt-1">
              {teamData.trend === 'up' && <TrendingUp className="h-3 w-3 text-good" />}
              {teamData.trend === 'down' && <AlertTriangle className="h-3 w-3 text-critical" />}
              {teamData.trend === 'stable' && <CheckCircle2 className="h-3 w-3 text-good" />}
              <span className="text-xs text-muted-foreground">
                {teamData.trend === 'up' ? 'Improving' : teamData.trend === 'down' ? 'Declining' : 'Stable'}
              </span>
            </div>
          </div>

          <div className="text-center">
            <p className="text-2xl font-semibold">{teamData.teamSize}</p>
            <p className="text-xs text-muted-foreground">Team Members</p>
            <Users className="h-4 w-4 mx-auto mt-1 text-muted-foreground" />
          </div>

          <div className="text-center">
            <p className="text-2xl font-semibold">{teamData.totalCompleted}</p>
            <p className="text-xs text-muted-foreground">Completed Tasks</p>
            <CheckCircle2 className="h-4 w-4 mx-auto mt-1 text-good" />
          </div>

          <div className="text-center">
            <p className="text-2xl font-semibold">{teamData.totalActive}</p>
            <p className="text-xs text-muted-foreground">Active Tasks</p>
            <CircleDashed className="h-4 w-4 mx-auto mt-1 text-warning" />
          </div>
        </div>

        {/* Workload Distribution */}
        <div className="border-t border-glass-border/60 pt-4">
          <p className="text-sm font-medium mb-3">Workload Distribution</p>
          <div className="flex gap-4">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-good" />
              <span className="text-xs text-muted-foreground">Balanced ({teamData.workloadDistribution.balanced})</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-warning" />
              <span className="text-xs text-muted-foreground">Overloaded ({teamData.workloadDistribution.overloaded})</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-critical" />
              <span className="text-xs text-muted-foreground">Underutilized ({teamData.workloadDistribution.underutilized})</span>
            </div>
          </div>
        </div>
      </GlassPanel>

      {/* Team Member Performance */}
      <GlassPanel
        title="Individual Performance"
        subtitle="Velocity and efficiency metrics per team member"
      >
        <div className="space-y-3">
          {teamData.members.map((member) => {
            const isOverloaded = member.activeTasks > 5;
            const isUnderutilized = member.activeTasks < 2 && member.completedTasks < 10;

            return (
              <div
                key={member.id}
                className={`border rounded-lg p-4 ${
                  isOverloaded ? 'border-warning/50 bg-warning/5' :
                  isUnderutilized ? 'border-critical/50 bg-critical/5' :
                  'border-glass-border/60'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{member.name}</p>
                      <p className="text-xs text-muted-foreground">{member.role}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {isOverloaded && (
                      <div className="flex items-center gap-1 text-xs text-warning">
                        <AlertTriangle className="h-3 w-3" />
                        Overloaded
                      </div>
                    )}
                    {isUnderutilized && (
                      <div className="flex items-center gap-1 text-xs text-critical">
                        <CircleDashed className="h-3 w-3" />
                        Underutilized
                      </div>
                    )}
                    {!isOverloaded && !isUnderutilized && (
                      <div className="flex items-center gap-1 text-xs text-good">
                        <CheckCircle2 className="h-3 w-3" />
                        Balanced
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Velocity</p>
                    <div className="flex items-center gap-2">
                      <CircularProgress
                        value={member.velocity}
                        size="sm"
                        tone={member.velocity >= 85 ? 'ops' : member.velocity >= 70 ? 'normal' : 'critical'}
                      />
                      <span className="text-sm font-medium">{member.velocity}%</span>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Completed</p>
                    <p className="text-sm font-medium">{member.completedTasks}</p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Active</p>
                    <p className="text-sm font-medium">{member.activeTasks}</p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Efficiency</p>
                    <div className="flex items-center gap-2">
                      <Zap className={`h-3 w-3 ${member.efficiency >= 85 ? 'text-good' : member.efficiency >= 70 ? 'text-warning' : 'text-critical'}`} />
                      <span className="text-sm font-medium">{member.efficiency}%</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </GlassPanel>

      {/* Team Efficiency Summary */}
      <GlassPanel
        title="Team Efficiency Summary"
        subtitle="Overall team health and productivity metrics"
        className="xl:col-span-2"
      >
        <div className="flex flex-wrap items-center justify-around gap-6 py-4">
          <CircularProgress
            value={teamData.avgEfficiency}
            label="Team Efficiency"
            caption={`${teamData.teamSize} members`}
            size="lg"
            tone={teamData.avgEfficiency >= 85 ? 'ops' : teamData.avgEfficiency >= 70 ? 'normal' : 'critical'}
          />
          <CircularProgress
            value={teamData.overallVelocity}
            label="Team Velocity"
            caption={`${teamData.totalCompleted} completed`}
            size="lg"
            tone={teamData.overallVelocity >= 85 ? 'ops' : teamData.overallVelocity >= 70 ? 'normal' : 'critical'}
          />
        </div>

        <div className="border-t border-glass-border/60 pt-4">
          <h4 className="text-sm font-medium mb-3">Team Insights</h4>
          <ul className="space-y-2 text-xs">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-good shrink-0 mt-0.5" />
              <span>Team is performing well with {teamData.overallVelocity}% velocity and {teamData.avgEfficiency}% efficiency</span>
            </li>
            {teamData.workloadDistribution.overloaded > 0 && (
              <li className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                <span>{teamData.workloadDistribution.overloaded} team members are overloaded - consider redistributing work</span>
              </li>
            )}
            {teamData.workloadDistribution.underutilized > 0 && (
              <li className="flex items-start gap-2">
                <CircleDashed className="h-4 w-4 text-critical shrink-0 mt-0.5" />
                <span>{teamData.workloadDistribution.underutilized} team member could take on more responsibilities</span>
              </li>
            )}
            {teamData.trend === 'up' && (
              <li className="flex items-start gap-2">
                <TrendingUp className="h-4 w-4 text-good shrink-0 mt-0.5" />
                <span>Team performance is trending upward - keep up the good work!</span>
              </li>
            )}
          </ul>
        </div>
      </GlassPanel>
    </div>
  );
}