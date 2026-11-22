import { Diamond } from 'lucide-react';
import type { ProjectTask } from './api';

export default function ProjectTimeline({ tasks }: { tasks: ProjectTask[] }) {
  const maxTimelineDay = Math.max(7, ...tasks.map((task) => Math.max(
    (task.startDay ?? 0) + (task.durationDays ?? 0) + 1,
    (task.baselineStart ?? 0) + (task.baselineDuration ?? 0) + 1,
  )));
  return (
    <div className="project-timeline-box">
      <div className="timeline-header">
        <strong>Timeline dự án (Gantt & Baseline)</strong>
        <span>Thang {maxTimelineDay} ngày · Thanh xanh: Kế hoạch · Thanh xám: Baseline · ◆: Cột mốc 0 ngày</span>
      </div>
      <div className="timeline-scroll-wrap">
        <div className="timeline-rows">
          {tasks.map((t) => {
            const startDay = t.startDay ?? 0;
            const dur = t.durationDays ?? 0;
            const baseStart = t.baselineStart ?? 0;
            const baseDur = t.baselineDuration ?? 0;

            const leftPct = Math.min(94, Math.max(0, (startDay / maxTimelineDay) * 100));
            const widthPct =
              dur === 0
                ? 0
                : Math.min(100 - leftPct, Math.max(3, (dur / maxTimelineDay) * 100));

            const baseLeftPct = Math.min(94, Math.max(0, (baseStart / maxTimelineDay) * 100));
            const baseWidthPct =
              baseDur === 0
                ? 0
                : Math.min(100 - baseLeftPct, Math.max(3, (baseDur / maxTimelineDay) * 100));

            const isZeroDuration = dur === 0;
            return (
              <div className="timeline-row" key={`tl-${t.id}`}>
                <div className="timeline-row-label">
                  {(t.isMilestone || isZeroDuration) && <Diamond size={11} className="milestone-icon" />}
                  <span title={t.title}>{t.title}</span>
                </div>
                <div className="timeline-track-wrap">
                  {baseDur === 0 ? (
                    <div
                      className="timeline-milestone-baseline"
                      style={{ left: `${baseLeftPct}%` }}
                      title={`Baseline cột mốc: Ngày ${baseStart} (0 ngày)`}
                    />
                  ) : (
                    <div
                      className="timeline-bar-baseline"
                      style={{ left: `${baseLeftPct}%`, width: `${baseWidthPct}%` }}
                      title={`Baseline: Ngày ${baseStart} → Ngày ${baseStart + baseDur} (${baseDur} ngày)`}
                    />
                  )}
                  {isZeroDuration ? (
                    <div
                      className={`timeline-milestone-zero ${t.isDone || t.status === 'done' ? 'done' : ''}`}
                      style={{ left: `${leftPct}%` }}
                      title={`Cột mốc 0 ngày: Ngày ${startDay} (0 ngày)`}
                    >
                      ◆
                    </div>
                  ) : (
                    <div
                      className={`timeline-bar-actual ${t.isDone || t.status === 'done' ? 'done' : ''} ${t.isMilestone ? 'milestone' : ''}`}
                      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                      title={`Ngày ${startDay} → Ngày ${startDay + dur} (${dur} ngày)`}
                    />
                  )}
                </div>
                <small className="timeline-days-meta">
                  N{startDay} ({dur}d{t.isMilestone || isZeroDuration ? ' ◆' : ''})
                </small>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
