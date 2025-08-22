import React, { useMemo, useRef, useState } from 'react';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import { AxisBottom } from '@visx/axis';
import { scaleTime, scaleLinear } from '@visx/scale';
import { LinePath } from '@visx/shape';
import { localPoint } from '@visx/event';
import clsx from 'clsx';
import { format } from 'date-fns';
import {
  mockPatientEvents,
  metricSeries,
  TimelineEvent,
  TimelineEventType,
  MetricSeries,
} from '../data/mockPatientData';

const bgPanel = 'bg-[#0c1220]';
const bgStripeA = '#101a2c';
const bgStripeB = '#0b1426';
const gridStroke = '#1f2a44';
const axisStroke = '#2a3b5f';
const axisLabel = '#7aa2ff';
const neon = {
  cyan: '#21d4fd',
  purple: '#b721ff',
  teal: '#12d6b0',
  amber: '#ffb020',
  pink: '#ff5ea7',
  blue: '#3ba7ff',
};

const typeColors: Record<TimelineEventType, string> = {
  diagnosis: neon.pink,
  medication: neon.blue,
  lab: neon.teal,
  procedure: neon.amber,
  complaint: '#ff7aa2',
  imaging: neon.purple,
  vital: neon.cyan,
  life: '#8cff66',
};

const rowsByType: Record<TimelineEventType, number> = {
  diagnosis: 0,
  medication: 1,
  lab: 2,
  procedure: 3,
  complaint: 4,
  imaging: 5,
  vital: 6,
  life: 7,
};

const seriesColor: Record<MetricSeries['id'], string> = {
  weight: neon.cyan,
  systolic: neon.blue,
  diastolic: neon.purple,
  sleepScore: neon.teal,
  stressIndex: neon.pink,
};

function useContainerWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  React.useLayoutEffect(() => {
    if (!ref.current) return;
    const obs = new ResizeObserver(([entry]) => setW(entry.contentRect.width));
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return { ref, width: w };
}

// utils
const chipClasses = (active: boolean) =>
  `px-3 py-1 rounded-lg border text-xs tracking-wide transition
   ${
     active
       ? 'bg-teal-600/80 border-teal-400 text-white' // <-- active teal
       : 'bg-[#0b1426] border-[#1c2a46] text-slate-300 hover:text-slate-100'
   }`;

const pillClasses = (active: boolean) =>
  clsx(
    'px-2.5 py-1 rounded-full text-xs border transition-colors duration-150',
    active
      ? 'bg-blue-600 text-white border-blue-300 shadow-sm'
      : 'bg-[#0b1426] text-slate-300 border-[#1c2a46] hover:text-slate-100 hover:border-slate-500'
  );

export const Timeline: React.FC = () => {
  // filter state
  const [enabledTypes, setEnabledTypes] = useState<Record<TimelineEventType, boolean>>({
    diagnosis: true,
    medication: true,
    lab: true,
    procedure: true,
    complaint: true,
    imaging: true,
    vital: true,
    life: true,
  });

  const [enabledSeries, setEnabledSeries] = useState<Record<MetricSeries['id'], boolean>>({
    weight: true,
    systolic: true,
    diastolic: true,
    sleepScore: true,
    stressIndex: true,
    // exercise per day
    // pounds of vegetables - some diet
  });

  const events = useMemo(() => mockPatientEvents.filter((e) => enabledTypes[e.type]), [enabledTypes]);

  // time range + scale
  const allTimes = useMemo(() => mockPatientEvents.map((e) => new Date(e.timestamp).getTime()), []);

  const minDate = new Date(Math.min(...allTimes));
  const maxDate = new Date(Math.max(...allTimes));

  // view range chips: '1M' | '3M' | '6M' | '1Y' | 'ALL'
  const [range, setRange] = useState<'1M' | '3M' | '6M' | '1Y' | 'ALL'>('ALL');

  const viewDomain = useMemo<[Date, Date]>(() => {
    if (range === 'ALL') return [minDate, maxDate];
    const end = maxDate; // anchor to latest by default
    const start = new Date(end);
    if (range === '1M') start.setMonth(start.getMonth() - 1);
    if (range === '3M') start.setMonth(start.getMonth() - 3);
    if (range === '6M') start.setMonth(start.getMonth() - 6);
    if (range === '1Y') start.setFullYear(start.getFullYear() - 1);
    // clamp to global min
    if (start < minDate) return [minDate, end];
    return [start, end];
  }, [range, minDate, maxDate]);

  // layout
  const metricsHeight = 140;
  const rows = Math.max(...Object.values(rowsByType)) + 1;
  const rowHeight = 36;
  const axisHeight = 40;
  const paddingLeft = 70;
  const paddingRight = 40;
  const topPad = 8;
  const contentHeight = rows * rowHeight + metricsHeight + axisHeight + topPad;
  const contentWidth = 2200;
  // const contentWidth = months * baseWidthPerMonth + paddingLeft + paddingRight;

  // x-scale
  const xScale = useMemo(
    () => scaleTime<number>({ domain: viewDomain, range: [paddingLeft, contentWidth - paddingRight] }),
    [viewDomain]
  );

  // y-scale
  const yScales = useMemo(() => {
    // these would be like 'dimensions' from the FDD - some sub-dimension i need to review the definition.
    const domains: Record<MetricSeries['id'], [number, number]> = {} as any;
    for (const metric of metricSeries) {
      const vals = metric.points.map((p) => p.value);
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const pad = (max - min) * 0.1 || 10;
      domains[metric.id] = [min - pad, max + pad];
    }
    const trackHeight = metricsHeight / 2;

    return {
      top: (id: MetricSeries['id']) =>
        scaleLinear<number>({
          domain: domains[id],
          range: [topPad + rowHeight * rows + trackHeight - 10, topPad + rowHeight * rows + 10],
        }),
      bottom: (id: MetricSeries['id']) =>
        scaleLinear<number>({
          domain: domains[id],
          range: [topPad + rowHeight * rows + metricsHeight - 10, topPad + rowHeight * rows + trackHeight + 10],
        }),
      trackHeight,
    };
  }, [rows]);

  const filteredSeries = metricSeries.filter((metric) => enabledSeries[metric.id]); // TODO; enabledMetric

  // tooltip
  // const containerRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; content: React.ReactNode } | null>(null);
  const { ref: viewportRef, width: viewportW } = useContainerWidth<HTMLDivElement>();

  const initialScale = useMemo(() => {
    if (!viewportW) {
      return 1;
    }
    return Math.min(1, viewportW / contentWidth);
  }, [viewportW, contentWidth]);

  // helper to clamp tooltip
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  const tooltipOffset = 12;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-wide text-slate-100">Patient Timeline</h1>
            <p className="text-xs text-slate-300/80 mt-1">
              Drag to pan • Scroll/Pinch to zoom • Toggle tracks & event types
            </p>
          </div>
          {/* Range chips */}
          <div className="flex items-center gap-2">
            {(['1M', '3M', '6M', '1Y', 'ALL'] as const).map((r) => (
              <button key={r} onClick={() => setRange(r)} className={chipClasses(range === r)}>
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Toggles */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400 mr-1">Show events:</span>
            {Object.keys(rowsByType).map((t) => {
              const active = enabledTypes[t as TimelineEventType];
              return (
                <button
                  key={t}
                  onClick={() => setEnabledTypes((prev) => ({ ...prev, [t]: !prev[t as TimelineEventType] }))}
                  className={pillClasses(active)}
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full mr-2"
                    style={{ background: typeColors[t as TimelineEventType] }}
                  />
                  <span className="capitalize">{t}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400 mr-1">Show metrics:</span>
            {metricSeries.map((s) => {
              const active = enabledSeries[s.id];
              return (
                <button
                  key={s.id}
                  onClick={() => setEnabledSeries((prev) => ({ ...prev, [s.id]: !prev[s.id] }))}
                  className={pillClasses(active)}
                >
                  <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: seriesColor[s.id] }} />
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Timeline viewport */}
      <div
        ref={viewportRef}
        className={clsx('relative border rounded-xl shadow-lg overflow-hidden', bgPanel)}
        style={{ height: contentHeight + 18 }}
      >
        {/* neon HUD border glow */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ boxShadow: 'inset 0 0 40px rgba(33,212,253,0.08), inset 0 0 60px rgba(183,33,255,0.06)' }}
        />
        <TransformWrapper
          key={viewportW}
          minScale={Math.min(1, (viewportW || 1) / contentWidth)}
          maxScale={6}
          initialScale={initialScale}
          centerOnInit
          wheel={{ step: 0.08 }}
          doubleClick={{ disabled: true }}
          panning={{ velocityDisabled: true }}
        >
          {({ zoomIn, zoomOut, resetTransform }) => (
            <>
              {/* Zoom controls */}
              <div className="absolute right-3 top-3 z-20 flex gap-2">
                <button
                  onClick={() => zoomOut()}
                  className="px-2 py-1 text-xs rounded bg-slate-800/70 text-slate-100 hover:bg-slate-700"
                >
                  –
                </button>
                <button
                  onClick={() => zoomIn()}
                  className="px-2 py-1 text-xs rounded bg-slate-800/70 text-slate-100 hover:bg-slate-700"
                >
                  +
                </button>
                <button
                  onClick={() => resetTransform()}
                  className="px-2 py-1 text-xs rounded bg-slate-800/70 text-slate-100 hover:bg-slate-700"
                >
                  Reset
                </button>
              </div>

              <TransformComponent wrapperClass="!w-full !h-full" contentClass="!w-fit !h-fit">
                <svg width={contentWidth} height={contentHeight}>
                  {/* alternating stripes */}
                  {Array.from({ length: rows }).map((_, i) => (
                    <rect
                      key={i}
                      x={0}
                      y={topPad + i * rowHeight}
                      width={contentWidth}
                      height={rowHeight}
                      fill={i % 2 === 0 ? bgStripeA : bgStripeB}
                    />
                  ))}

                  {/* faint vertical grid */}
                  {Array.from({ length: 24 }).map((_, i) => {
                    const x = paddingLeft + i * ((contentWidth - paddingRight - paddingLeft) / 24);
                    return <line key={i} x1={x} x2={x} y1={0} y2={contentHeight} stroke={gridStroke} strokeWidth={1} />;
                  })}

                  {/* Metric tracks background */}
                  <rect
                    x={0}
                    y={topPad + rows * rowHeight}
                    width={contentWidth}
                    height={metricsHeight}
                    fill="#0a1221"
                    opacity={0.6}
                  />

                  {/* Metric lines (top/bottom panels) */}
                  {filteredSeries.map((s, idx) => {
                    const isTop = idx % 2 === 0;
                    const yScale = (isTop ? yScales.top : yScales.bottom)(s.id);
                    return (
                      <g key={s.id}>
                        <LinePath
                          data={s.points}
                          x={(d) => xScale(new Date(d.t))}
                          y={(d) => yScale(d.value)}
                          stroke={seriesColor[s.id]}
                          strokeWidth={2}
                          strokeOpacity={0.9}
                          curve={undefined}
                        />
                        {/* hover points */}
                        {s.points.map((p, i) => (
                          <circle
                            key={i}
                            cx={xScale(new Date(p.t))}
                            cy={yScale(p.value)}
                            r={3}
                            fill={seriesColor[s.id]}
                            onMouseEnter={(evt) => {
                              const lp = localPoint(evt) as { x: number; y: number };
                              setHover({
                                x: lp.x + 10,
                                y: lp.y + 10,
                                content: (
                                  <div>
                                    <div className="font-semibold">{s.label}</div>
                                    <div className="opacity-80">{format(new Date(p.t), 'PP p')}</div>
                                    <div>
                                      {p.value}
                                      {s.unit ? ` ${s.unit}` : ''}
                                    </div>
                                  </div>
                                ),
                              });
                            }}
                            onMouseLeave={() => setHover(null)}
                          />
                        ))}
                      </g>
                    );
                  })}

                  {/* Events */}
                  {events.map((e) => {
                    const x = xScale(new Date(e.timestamp));
                    const row = rowsByType[e.type];
                    const cy = topPad + row * rowHeight + rowHeight / 2;
                    const color = typeColors[e.type];
                    return (
                      <g
                        key={e.id}
                        transform={`translate(${x}, ${cy})`}
                        className="cursor-pointer"
                        onMouseEnter={(evt) => {
                          const lp = localPoint(evt) as { x: number; y: number };
                          setHover({
                            x: lp.x + 10,
                            y: lp.y + 10,
                            content: (
                              <div>
                                <div className="font-semibold">{e.label}</div>
                                <div className="opacity-80">{format(new Date(e.timestamp), 'PP p')}</div>
                                {e.meta && (
                                  <pre className="mt-1 text-[10px] text-slate-300/80 whitespace-pre-wrap">
                                    {JSON.stringify(e.meta, null, 2)}
                                  </pre>
                                )}
                              </div>
                            ),
                          });
                        }}
                        onMouseLeave={() => setHover(null)}
                        onClick={() => {
                          // TODO: open drawer/sheet; for now alert
                          alert(`${e.label}\n${new Date(e.timestamp).toLocaleString()}`);
                        }}
                      >
                        {/* stem */}
                        <line x1={0} x2={0} y1={-12} y2={12} stroke="#6b7fb1" strokeOpacity={0.6} />
                        {/* neon node */}
                        <circle r={7} fill={color} stroke="#0b0f1c" strokeWidth={2} />
                        <circle r={11} fill="none" stroke={color} strokeOpacity={0.35} />
                      </g>
                    );
                  })}

                  {/* Axis */}
                  <g transform={`translate(0, ${topPad + rows * rowHeight + metricsHeight + 6})`}>
                    <AxisBottom
                      scale={xScale}
                      stroke={axisStroke}
                      tickStroke={axisStroke}
                      tickLabelProps={() => ({
                        fontSize: 11,
                        fill: axisLabel,
                        textAnchor: 'middle',
                        dy: '0.6em',
                      })}
                    />
                  </g>
                </svg>

                {/* Tooltip + clamping*/}
                {hover && (
                  <div
                    className="absolute z-30 pointer-events-none bg-[#0f172a] text-slate-100 border border-slate-700 rounded-md shadow px-3 py-2 text-xs"
                    style={{
                      left: clamp(hover.x + tooltipOffset, 8, contentWidth - 300),
                      top: clamp(hover.y + tooltipOffset, 8, contentHeight - 100),
                      maxWidth: 280,
                    }}
                  >
                    {hover.content}
                  </div>
                )}
              </TransformComponent>
            </>
          )}
        </TransformWrapper>
      </div>
    </div>
  );
};
