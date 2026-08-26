import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { CompleteReportData } from './ReportService';

export class ReportPDFGenerator {
  /**
   * Generates an executive management PDF report and opens native share/download dialog.
   */
  static async exportPDF(report: CompleteReportData, userRole: string = 'Founder'): Promise<string> {
    const {
      period,
      generatedAt,
      summary,
      progressDistribution,
      overdueAnalysis,
      departmentPerformance,
      teamPerformance,
      individualPerformance,
      priorityAnalysis,
      scopeAnalysis,
      selfAssignedAnalysis,
    } = report;

    const formattedDate = new Date(generatedAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    // 1. Dynamic Data-Driven Executive Insight
    const total = summary.totalTasks;
    const completed = summary.completedTasks;
    const active = summary.activeTasks;
    const overdue = summary.overdueTasks;
    const rate = summary.completionRate;
    const adherence = summary.deadlineAdherenceRate;

    let executiveInsightText = '';
    if (total === 0) {
      executiveInsightText = 'No task records were recorded for this selected reporting period.';
    } else {
      executiveInsightText = `During this reporting period, <strong>${total} tasks</strong> were monitored across the organization. <strong>${completed} tasks (${rate}%)</strong> have been successfully completed, with <strong>${active} tasks</strong> currently active in progress. Overall deadline adherence stands at <strong>${adherence}%</strong>, with ${
        overdue === 0
          ? '<span style="color: #059669; font-weight: 700;">zero overdue tasks</span> across all operational units.'
          : `<span style="color: #dc2626; font-weight: 700;">${overdue} task${overdue > 1 ? 's' : ''} currently overdue</span> requiring leadership attention.`
      }`;
    }

    // 2. Task Health Status Percentages
    const completedPct = total > 0 ? Math.round((completed / total) * 100) : 0;
    const inProgressPct = total > 0 ? Math.round((summary.inProgressTasks / total) * 100) : 0;
    const toDoPct = total > 0 ? Math.round((summary.toDoTasks / total) * 100) : 0;
    const overduePct = total > 0 ? Math.round((overdue / total) * 100) : 0;

    // 3. Progress Bracket Distributions
    const progressBands = [
      { label: '0% (Not Started)', count: progressDistribution.zero, color: '#94a3b8' },
      { label: '1% – 25% (Initial Phase)', count: progressDistribution.tier1, color: '#38bdf8' },
      { label: '26% – 50% (Midway)', count: progressDistribution.tier2, color: '#3b82f6' },
      { label: '51% – 75% (Advanced)', count: progressDistribution.tier3, color: '#6366f1' },
      { label: '76% – 99% (Final Verification)', count: progressDistribution.tier4, color: '#8b5cf6' },
      { label: '100% (Completed)', count: progressDistribution.complete, color: '#10b981' },
    ];

    const progressBandsHtml = progressBands.map(b => {
      const pct = total > 0 ? Math.round((b.count / total) * 100) : 0;
      return `
        <div style="margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 3px;">
            <span style="font-weight: 600; color: #334155;">${b.label}</span>
            <span style="font-weight: 700; color: #0f172a;">${b.count} tasks <span style="color: #64748b; font-weight: 500;">(${pct}%)</span></span>
          </div>
          <div style="height: 6px; background-color: #f1f5f9; border-radius: 99px; overflow: hidden;">
            <div style="height: 100%; width: ${pct}%; background-color: ${b.color}; border-radius: 99px;"></div>
          </div>
        </div>
      `;
    }).join('');

    // 4. Overdue Block HTML
    let overdueBlockHtml = '';
    if (overdue === 0) {
      overdueBlockHtml = `
        <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px; text-align: center;">
          <div style="font-size: 20px; margin-bottom: 2px;">🛡️</div>
          <div style="font-size: 13px; font-weight: 700; color: #15803d;">All Clear - 100% On-Schedule</div>
          <div style="font-size: 11px; color: #166534; margin-top: 2px;">No tasks are currently overdue across any department.</div>
        </div>
      `;
    } else {
      overdueBlockHtml = `
        <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-size: 12px; font-weight: 700; color: #b91c1c;">⚠️ Overdue Risk Severity</span>
            <span style="font-size: 11px; font-weight: 700; background-color: #fee2e2; color: #b91c1c; padding: 2px 6px; border-radius: 4px;">${overdue} Total</span>
          </div>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; font-size: 10px; text-align: center;">
            <div style="background: #ffffff; padding: 6px; border-radius: 4px; border: 1px solid #fed7d7;">
              <div style="color: #64748b;">1–3 Days</div>
              <div style="font-weight: 700; font-size: 13px; color: #b91c1c;">${overdueAnalysis.oneDay + overdueAnalysis.twoToThreeDays}</div>
            </div>
            <div style="background: #ffffff; padding: 6px; border-radius: 4px; border: 1px solid #fed7d7;">
              <div style="color: #64748b;">4–14 Days</div>
              <div style="font-weight: 700; font-size: 13px; color: #dc2626;">${overdueAnalysis.fourToSevenDays + overdueAnalysis.eightToFourteenDays}</div>
            </div>
            <div style="background: #ffffff; padding: 6px; border-radius: 4px; border: 1px solid #fca5a5;">
              <div style="color: #64748b;">15+ Days</div>
              <div style="font-weight: 700; font-size: 13px; color: #991b1b;">${overdueAnalysis.fifteenPlusDays}</div>
            </div>
          </div>
        </div>
      `;
    }

    // 5. Department Performance Rows
    const deptRowsHtml = departmentPerformance.map(d => `
      <tr>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #0f172a;">${d.name}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">${d.totalTasks}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: center; color: #2563eb;">${d.activeTasks}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: center; color: #059669; font-weight: 600;">${d.completedTasks}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: center; color: ${d.overdueTasks > 0 ? '#dc2626' : '#64748b'}; font-weight: 600;">${d.overdueTasks}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; width: 140px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <div style="flex: 1; height: 6px; background-color: #f1f5f9; border-radius: 99px; overflow: hidden;">
              <div style="height: 100%; width: ${d.completionRate}%; background-color: ${d.completionRate >= 70 ? '#10b981' : d.completionRate >= 40 ? '#3b82f6' : '#f59e0b'}; border-radius: 99px;"></div>
            </div>
            <span style="font-size: 11px; font-weight: 700; color: #0f172a; width: 32px; text-align: right;">${d.completionRate}%</span>
          </div>
        </td>
      </tr>
    `).join('');

    // 6. Team Leadership Rows
    const teamRowsHtml = teamPerformance.map(t => `
      <tr>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #0f172a;">${t.managerName}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; color: #475569;">${t.departmentName}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">${t.totalTasks}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: center; color: #059669; font-weight: 600;">${t.completedTasks}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: center; color: ${t.overdueTasks > 0 ? '#dc2626' : '#64748b'};">${t.overdueTasks}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; width: 120px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <div style="flex: 1; height: 6px; background-color: #f1f5f9; border-radius: 99px; overflow: hidden;">
              <div style="height: 100%; width: ${t.completionRate}%; background-color: #3b82f6; border-radius: 99px;"></div>
            </div>
            <span style="font-size: 11px; font-weight: 700; color: #0f172a; width: 30px; text-align: right;">${t.completionRate}%</span>
          </div>
        </td>
      </tr>
    `).join('');

    // 7. Priority Rows
    const priorityColors: Record<string, string> = {
      Urgent: '#dc2626',
      High: '#ea580c',
      Medium: '#3b82f6',
      Low: '#64748b',
    };

    const priorityRowsHtml = priorityAnalysis.map(p => `
      <tr>
        <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-weight: 700;">
          <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: ${priorityColors[p.priority] || '#64748b'}; margin-right: 6px;"></span>
          ${p.priority}
        </td>
        <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: 700;">${p.total}</td>
        <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: center; color: #2563eb;">${p.inProgress}</td>
        <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: center; color: #059669; font-weight: 600;">${p.completed}</td>
        <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: center; color: ${p.overdue > 0 ? '#dc2626' : '#64748b'};">${p.overdue}</td>
        <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: center; color: #64748b;">${p.remaining}</td>
      </tr>
    `).join('');

    // 8. Individual Performance Rows (top 10)
    const individualRowsHtml = individualPerformance.slice(0, 10).map((u, idx) => `
      <tr>
        <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="display: inline-block; width: 18px; height: 18px; border-radius: 50%; background: #e2e8f0; color: #334155; font-size: 9px; font-weight: 700; line-height: 18px; text-align: center;">${idx + 1}</span>
            <span style="font-weight: 700; color: #0f172a;">${u.name}</span>
          </div>
        </td>
        <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 11px;">${u.role} · ${u.departmentName}</td>
        <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: 600;">${u.assignedTasks}</td>
        <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: center; color: #059669; font-weight: 600;">${u.completedTasks}</td>
        <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: center; color: ${u.overdueTasks > 0 ? '#dc2626' : '#64748b'};">${u.overdueTasks}</td>
        <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; width: 100px;">
          <div style="display: flex; align-items: center; gap: 4px;">
            <div style="flex: 1; height: 5px; background-color: #f1f5f9; border-radius: 99px; overflow: hidden;">
              <div style="height: 100%; width: ${u.completionRate}%; background-color: #10b981; border-radius: 99px;"></div>
            </div>
            <span style="font-size: 10px; font-weight: 700; color: #0f172a; width: 28px; text-align: right;">${u.completionRate}%</span>
          </div>
        </td>
      </tr>
    `).join('');

    // 9. Highlights Computation based on real data
    const highlights: string[] = [];
    if (departmentPerformance.length > 0) {
      const topDept = [...departmentPerformance].sort((a, b) => b.completionRate - a.completionRate)[0];
      if (topDept && topDept.totalTasks > 0) {
        highlights.push(`<strong>Top Performing Department:</strong> ${topDept.name} leads with a ${topDept.completionRate}% completion rate.`);
      }
      const largestWorkload = [...departmentPerformance].sort((a, b) => b.totalTasks - a.totalTasks)[0];
      if (largestWorkload && largestWorkload.totalTasks > 0) {
        highlights.push(`<strong>Primary Workload Driver:</strong> ${largestWorkload.name} accounts for ${largestWorkload.totalTasks} tasks (${Math.round((largestWorkload.totalTasks / (total || 1)) * 100)}% of total volume).`);
      }
    }

    if (overdue === 0 && total > 0) {
      highlights.push(`<strong>Risk Mitigation:</strong> 100% on-time execution maintained with 0 overdue items.`);
    } else if (overdue > 0) {
      highlights.push(`<strong>Attention Required:</strong> ${overdue} overdue task${overdue > 1 ? 's' : ''} currently tracked in execution queue.`);
    }

    if (selfAssignedAnalysis.total > 0) {
      highlights.push(`<strong>Employee Initiative:</strong> ${selfAssignedAnalysis.total} self-assigned task${selfAssignedAnalysis.total > 1 ? 's' : ''} logged with ${selfAssignedAnalysis.completionRate}% completion.`);
    }

    const highlightsHtml = highlights.length > 0 ? `
      <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; border-radius: 0 8px 8px 0; padding: 10px 14px; margin-top: 14px;">
        <div style="font-size: 12px; font-weight: 700; color: #1e293b; margin-bottom: 4px;">Management Highlights</div>
        <ul style="margin: 0; padding-left: 16px; font-size: 11px; color: #475569; line-height: 1.6;">
          ${highlights.map(h => `<li>${h}</li>`).join('')}
        </ul>
      </div>
    ` : '';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>ZeroTask Executive Performance Report</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 12mm 12mm 12mm 12mm;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              color: #0f172a;
              background-color: #ffffff;
              margin: 0;
              padding: 0;
              font-size: 12px;
              line-height: 1.4;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .page {
              box-sizing: border-box;
              min-height: 270mm;
              position: relative;
            }
            .page-break {
              page-break-before: always;
              break-before: page;
              padding-top: 8px;
            }
            .header-bar {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 2px solid #0f172a;
              padding-bottom: 12px;
              margin-bottom: 14px;
            }
            .logo-wrap {
              display: flex;
              align-items: center;
              gap: 8px;
            }
            .logo-mark {
              width: 28px;
              height: 28px;
              background: #0f172a;
              color: #ffffff;
              border-radius: 6px;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              font-weight: 900;
              font-size: 14px;
            }
            .logo-text {
              font-size: 20px;
              font-weight: 800;
              letter-spacing: -0.5px;
              color: #0f172a;
            }
            .logo-accent {
              color: #2563eb;
            }
            .header-meta {
              text-align: right;
              font-size: 10px;
              color: #64748b;
            }
            .meta-badge {
              display: inline-block;
              background-color: #f1f5f9;
              color: #334155;
              padding: 2px 8px;
              border-radius: 4px;
              font-weight: 700;
              margin-bottom: 2px;
            }
            .section-title {
              font-size: 13px;
              font-weight: 800;
              color: #0f172a;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin-top: 14px;
              margin-bottom: 8px;
              display: flex;
              align-items: center;
              gap: 6px;
            }
            .section-title::before {
              content: '';
              display: inline-block;
              width: 3px;
              height: 12px;
              background-color: #2563eb;
              border-radius: 2px;
            }
            .kpi-grid {
              display: grid;
              grid-template-columns: repeat(6, 1fr);
              gap: 8px;
              margin-bottom: 12px;
            }
            .kpi-card {
              background-color: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              padding: 8px 6px;
              text-align: center;
            }
            .kpi-num {
              font-size: 20px;
              font-weight: 800;
              color: #0f172a;
              line-height: 1.1;
            }
            .kpi-lbl {
              font-size: 9px;
              font-weight: 700;
              color: #64748b;
              text-transform: uppercase;
              letter-spacing: 0.4px;
              margin-top: 3px;
            }
            .insight-box {
              background-color: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              padding: 10px 14px;
              margin-bottom: 12px;
              font-size: 11.5px;
              color: #334155;
              line-height: 1.5;
            }
            .health-grid {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 6px;
              margin-bottom: 12px;
            }
            .health-pill {
              background-color: #ffffff;
              border: 1px solid #e2e8f0;
              border-radius: 6px;
              padding: 6px 8px;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
            .health-pill-lbl {
              font-size: 10px;
              font-weight: 600;
              color: #64748b;
            }
            .health-pill-val {
              font-size: 12px;
              font-weight: 800;
            }
            .dual-col {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 12px;
              margin-bottom: 12px;
            }
            .data-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 12px;
            }
            .data-table th {
              background-color: #f8fafc;
              color: #475569;
              font-weight: 700;
              padding: 6px 10px;
              text-align: left;
              border-bottom: 2px solid #e2e8f0;
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 0.4px;
            }
            .footer {
              border-top: 1px solid #e2e8f0;
              padding-top: 8px;
              margin-top: 14px;
              display: flex;
              justify-content: space-between;
              align-items: center;
              font-size: 9px;
              color: #94a3b8;
            }
          </style>
        </head>
        <body>
          <!-- ════════════════ PAGE 1: EXECUTIVE DASHBOARD ════════════════ -->
          <div class="page">
            <!-- Masthead -->
            <div class="header-bar">
              <div class="logo-wrap">
                <div class="logo-mark">Z</div>
                <div>
                  <div class="logo-text">Zero<span class="logo-accent">Task</span></div>
                  <div style="font-size: 11px; font-weight: 600; color: #64748b;">Executive Performance & Management Intelligence</div>
                </div>
              </div>
              <div class="header-meta">
                <div><span class="meta-badge">Period: ${period}</span></div>
                <div>Scope: <strong>${userRole} Oversight</strong> · Generated: <strong>${formattedDate}</strong></div>
              </div>
            </div>

            <!-- Executive Snapshot (KPI Cards) -->
            <div class="section-title">Executive Snapshot</div>
            <div class="kpi-grid">
              <div class="kpi-card">
                <div class="kpi-num">${summary.totalTasks}</div>
                <div class="kpi-lbl">Total Tasks</div>
              </div>
              <div class="kpi-card">
                <div class="kpi-num" style="color: #2563eb;">${summary.activeTasks}</div>
                <div class="kpi-lbl">Active Workload</div>
              </div>
              <div class="kpi-card">
                <div class="kpi-num" style="color: #059669;">${summary.completedTasks}</div>
                <div class="kpi-lbl">Completed</div>
              </div>
              <div class="kpi-card">
                <div class="kpi-num" style="color: ${summary.overdueTasks > 0 ? '#dc2626' : '#64748b'};">${summary.overdueTasks}</div>
                <div class="kpi-lbl">Overdue</div>
              </div>
              <div class="kpi-card">
                <div class="kpi-num" style="color: #10b981;">${summary.completionRate}%</div>
                <div class="kpi-lbl">Completion Rate</div>
              </div>
              <div class="kpi-card">
                <div class="kpi-num">${summary.avgProgress}%</div>
                <div class="kpi-lbl">Avg Progress</div>
              </div>
            </div>

            <!-- Executive Data-Driven Insight -->
            <div class="insight-box">
              <div style="font-weight: 700; font-size: 11px; color: #1e293b; text-transform: uppercase; margin-bottom: 2px;">Executive Briefing</div>
              ${executiveInsightText}
            </div>

            <!-- Task Health Visual Breakdown -->
            <div class="section-title">Task Distribution & Health</div>
            <div class="health-grid">
              <div class="health-pill" style="border-left: 3px solid #10b981;">
                <span class="health-pill-lbl">Completed</span>
                <span class="health-pill-val" style="color: #059669;">${summary.completedTasks} (${completedPct}%)</span>
              </div>
              <div class="health-pill" style="border-left: 3px solid #3b82f6;">
                <span class="health-pill-lbl">In Progress</span>
                <span class="health-pill-val" style="color: #2563eb;">${summary.inProgressTasks} (${inProgressPct}%)</span>
              </div>
              <div class="health-pill" style="border-left: 3px solid #94a3b8;">
                <span class="health-pill-lbl">To Do / Backlog</span>
                <span class="health-pill-val" style="color: #475569;">${summary.toDoTasks} (${toDoPct}%)</span>
              </div>
              <div class="health-pill" style="border-left: 3px solid ${overdue > 0 ? '#dc2626' : '#94a3b8'};">
                <span class="health-pill-lbl">Overdue</span>
                <span class="health-pill-val" style="color: ${overdue > 0 ? '#dc2626' : '#64748b'};">${overdue} (${overduePct}%)</span>
              </div>
            </div>

            <!-- Progress Distribution & Overdue Health Dual Column -->
            <div class="dual-col">
              <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px;">
                <div style="font-size: 11.5px; font-weight: 700; color: #0f172a; margin-bottom: 10px;">Execution Progress Breakdown</div>
                ${progressBandsHtml}
              </div>

              <div>
                <div style="margin-bottom: 10px;">${overdueBlockHtml}</div>
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px;">
                  <div style="font-size: 11.5px; font-weight: 700; color: #0f172a; margin-bottom: 6px;">Execution Velocity Metrics</div>
                  <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #e2e8f0; font-size: 11px;">
                    <span style="color: #64748b;">Deadline Adherence Rate:</span>
                    <span style="font-weight: 700; color: ${summary.deadlineAdherenceRate >= 80 ? '#059669' : '#d97706'};">${summary.deadlineAdherenceRate}%</span>
                  </div>
                  <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #e2e8f0; font-size: 11px;">
                    <span style="color: #64748b;">Remaining Backlog:</span>
                    <span style="font-weight: 700; color: #0f172a;">${summary.remainingTasks} tasks</span>
                  </div>
                  <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 11px;">
                    <span style="color: #64748b;">Self-Assigned Volume:</span>
                    <span style="font-weight: 700; color: #2563eb;">${selfAssignedAnalysis.total} tasks (${selfAssignedAnalysis.completionRate}% done)</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Department Performance -->
            ${departmentPerformance.length > 0 ? `
              <div class="section-title">Department Execution Performance</div>
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Department</th>
                    <th style="text-align: center;">Total</th>
                    <th style="text-align: center;">Active</th>
                    <th style="text-align: center;">Completed</th>
                    <th style="text-align: center;">Overdue</th>
                    <th style="text-align: right;">Completion Rate</th>
                  </tr>
                </thead>
                <tbody>
                  ${deptRowsHtml}
                </tbody>
              </table>
            ` : ''}

            <!-- Page 1 Footer -->
            <div class="footer">
              <div>ZeroTask Enterprise Intelligence · Confidential Executive Report</div>
              <div>Page 1 of 2</div>
            </div>
          </div>

          <!-- ════════════════ PAGE 2: OPERATIONAL INTELLIGENCE ════════════════ -->
          <div class="page page-break">
            <!-- Page 2 Header -->
            <div class="header-bar">
              <div class="logo-wrap">
                <div class="logo-mark">Z</div>
                <div class="logo-text" style="font-size: 16px;">Zero<span class="logo-accent">Task</span> <span style="font-weight: 500; font-size: 12px; color: #64748b;">· Leadership & Team Leaderboard</span></div>
              </div>
              <div class="header-meta">
                <div>Period: <strong>${period}</strong> · Scope: <strong>${userRole}</strong></div>
              </div>
            </div>

            <!-- Leadership & Manager Breakdown -->
            ${teamPerformance.length > 0 ? `
              <div class="section-title">Management & Team Performance</div>
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Lead / Manager</th>
                    <th>Department</th>
                    <th style="text-align: center;">Total</th>
                    <th style="text-align: center;">Completed</th>
                    <th style="text-align: center;">Overdue</th>
                    <th style="text-align: right;">Completion Rate</th>
                  </tr>
                </thead>
                <tbody>
                  ${teamRowsHtml}
                </tbody>
              </table>
            ` : ''}

            <!-- Priority Matrix & Self-Assigned Ownership Dual Column -->
            <div class="dual-col">
              <div>
                <div class="section-title" style="margin-top: 0;">Priority Distribution</div>
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Priority</th>
                      <th style="text-align: center;">Total</th>
                      <th style="text-align: center;">Active</th>
                      <th style="text-align: center;">Done</th>
                      <th style="text-align: center;">Late</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${priorityRowsHtml}
                  </tbody>
                </table>
              </div>

              <div>
                <div class="section-title" style="margin-top: 0;">Self-Assigned Workload Insight</div>
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px;">
                  <div style="font-size: 11px; color: #475569; line-height: 1.5; margin-bottom: 8px;">
                    Measures spontaneous task ownership and independent employee initiative across departments.
                  </div>
                  <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; text-align: center;">
                    <div style="background: #ffffff; padding: 8px 4px; border-radius: 6px; border: 1px solid #e2e8f0;">
                      <div style="font-size: 16px; font-weight: 800; color: #2563eb;">${selfAssignedAnalysis.total}</div>
                      <div style="font-size: 9px; font-weight: 600; color: #64748b; text-transform: uppercase;">Created</div>
                    </div>
                    <div style="background: #ffffff; padding: 8px 4px; border-radius: 6px; border: 1px solid #e2e8f0;">
                      <div style="font-size: 16px; font-weight: 800; color: #059669;">${selfAssignedAnalysis.completed}</div>
                      <div style="font-size: 9px; font-weight: 600; color: #64748b; text-transform: uppercase;">Completed</div>
                    </div>
                    <div style="background: #ffffff; padding: 8px 4px; border-radius: 6px; border: 1px solid #e2e8f0;">
                      <div style="font-size: 16px; font-weight: 800; color: #0f172a;">${selfAssignedAnalysis.completionRate}%</div>
                      <div style="font-size: 9px; font-weight: 600; color: #64748b; text-transform: uppercase;">Rate</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Individual Leaderboard -->
            ${individualPerformance.length > 0 ? `
              <div class="section-title">Individual Execution Leaderboard</div>
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Role & Dept</th>
                    <th style="text-align: center;">Assigned</th>
                    <th style="text-align: center;">Done</th>
                    <th style="text-align: center;">Late</th>
                    <th style="text-align: right;">Completion Rate</th>
                  </tr>
                </thead>
                <tbody>
                  ${individualRowsHtml}
                </tbody>
              </table>
            ` : ''}

            <!-- Strategic Management Highlights -->
            ${highlightsHtml}

            <!-- Page 2 Footer -->
            <div class="footer">
              <div>ZeroTask Enterprise Intelligence · Confidential Executive Report · Generated on ${formattedDate}</div>
              <div>Page 2 of 2</div>
            </div>
          </div>
        </body>
      </html>
    `;

    try {
      const { uri, base64 } = await Print.printToFileAsync({ html, base64: true });

      const cleanPeriod = (period || 'All_Time').replace(/\s+/g, '_');
      const targetFileName = `ZeroTask_Executive_Report_${cleanPeriod}_${Date.now()}.pdf`;
      const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory || '';
      const targetUri = `${baseDir}${targetFileName}`;

      if (base64) {
        await FileSystem.writeAsStringAsync(targetUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }

      if (await Sharing.isAvailableAsync()) {
        try {
          await Sharing.shareAsync(targetUri, {
            mimeType: 'application/pdf',
            dialogTitle: `ZeroTask Executive Report - ${period}`,
            UTI: 'com.adobe.pdf',
          });
        } catch (shareErr) {
          console.warn('Direct sharing failed, falling back to native print dialog:', shareErr);
          await Print.printAsync({ html });
        }
      } else {
        await Print.printAsync({ html });
      }

      return targetUri;
    } catch (err: any) {
      console.error('Error generating PDF report:', err);
      throw err;
    }
  }
}
