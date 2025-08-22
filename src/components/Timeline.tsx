import React, { useMemo, useRef, useState } from 'react';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { scaleTime, scaleLinear } from '@visx/scale';
import { LinePath } from '@visx/shape';
import { localPoint } from '@visx/event';
import clsx from 'clsx';
import { format } from 'date-fns';
import { mockPatientEvents, metricSeries, TimelineEventType, MetricSeries } from '../data/mockPatientData';
import type { LucideIcon } from 'lucide-react';
import {
  Pill,
  Heart,
  Beaker,
  Stethoscope,
  Activity,
  Image as ImageIcon,
  Syringe,
  Brain,
  ClipboardList,
} from 'lucide-react';

// helper methods -
const eventIcon: Record<TimelineEventType, LucideIcon> = {
  diagnosis: ClipboardList,
  medication: Pill,
  lab: Beaker,
  procedure: Syringe,
  complaint: Brain,
  imaging: ImageIcon,
  vital: Activity,
  life: Heart,
};

type UnitGroup = 'lb' | 'mmHg' | 'index100' | 'other';

const unitGroup: Record<MetricSeries['id'], UnitGroup> = {
  weight: 'lb',
  systolic: 'mmHg',
  diastolic: 'mmHg',
  sleepScore: 'index100', // treat both as 0–100 index
  stressIndex: 'index100',
};

const nodeStroke = '#0b0f1c';
const dashed = { strokeDasharray: '4 6' };

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

function useContainerSize<T extends HTMLElement>() {
  const ref = React.useRef<T | null>(null);
  const [size, setSize] = React.useState({ w: 0, h: 0 });
  React.useLayoutEffect(() => {
    if (!ref.current) return;
    const obs = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.round(width), h: Math.round(height) });
    });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return { ref, width: size.w, height: size.h };
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

const allTrue = <T extends string>(rec: Record<T, boolean>) => Object.values(rec).every(Boolean);
const anyTrue = <T extends string>(rec: Record<T, boolean>) => Object.values(rec).some(Boolean);

// Build a new record with every key set to `val`
function setAllRecord<T extends string>(keys: T[], val: boolean): Record<T, boolean> {
  return keys.reduce(
    (acc, k) => {
      acc[k] = val;
      return acc;
    },
    {} as Record<T, boolean>
  );
}

const pillAllTeal = (active: boolean) =>
  `px-2.5 py-1 rounded-full text-xs border transition
   ${
     active
       ? 'bg-teal-600/30 border-teal-400 text-teal-300'
       : 'bg-[#0b1426] border-[#1c2a46] text-slate-300 hover:text-slate-100'
   }`;

const pillAllBlue = (active: boolean) =>
  `px-2.5 py-1 rounded-full text-xs border transition
   ${
     active
       ? 'bg-blue-600/30 border-blue-400 text-blue-300'
       : 'bg-[#0b1426] border-[#1c2a46] text-slate-300 hover:text-slate-100'
   }`;

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

  const typeKeys = Object.keys(rowsByType) as TimelineEventType[];
  const metricKeys = metricSeries.map((s) => s.id);

  const allTypesOn = allTrue(enabledTypes);
  const allMetricsOn = allTrue(enabledSeries);

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
  // const metricsHeight = 140;
  const rows = Math.max(...Object.values(rowsByType)) + 1;
  const rowHeight = 36;
  const axisHeight = 40;
  const paddingLeft = 70;
  const paddingRight = 40;
  const topPad = 8;
  // const contentHeight = rows * rowHeight + metricsHeight + axisHeight + topPad;
  const contentWidth = 2200;
  // const contentWidth = months * baseWidthPerMonth + paddingLeft + paddingRight;

  const [hover, setHover] = useState<{ x: number; y: number; content: React.ReactNode } | null>(null);
  const { ref: viewportRef, width: viewportW, height: viewportH } = useContainerSize<HTMLDivElement>();
  const chartH = viewportH || rows * rowHeight + 140 + axisHeight + topPad;

  const metricsHeight = Math.max(
    140, // minimum metrics area
    Math.round(chartH * 0.45)
  );

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
  const activeMetricIds = filteredSeries.map((s) => s.id);
  const activeGroups = new Set(activeMetricIds.map((id) => unitGroup[id]));

  // SINGLE = exactly 1 metric
  // GROUP  = 2+ metrics but all in same unit group
  // NORMALIZED = 2+ metrics with mixed groups
  type AutoMode = 'SINGLE' | 'GROUP' | 'NORMALIZED';

  const autoScaleMode: AutoMode =
    activeMetricIds.length === 1 ? 'SINGLE' : activeGroups.size === 1 ? 'GROUP' : 'NORMALIZED';

  const activeGroup: UnitGroup | null =
    autoScaleMode === 'SINGLE' || autoScaleMode === 'GROUP' ? ([...activeGroups][0] ?? null) : null;

  const ySingle = useMemo(() => {
    if (autoScaleMode !== 'SINGLE') return null;
    const id = activeMetricIds[0];
    const series = metricSeries.find((s) => s.id === id);
    if (!series) return null;
    const vals = series.points.map((p) => p.value);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = (max - min) * 0.1 || 10;
    return scaleLinear<number>({
      domain: [min - pad, max + pad],
      range: [topPad + rowHeight * rows + metricsHeight - 10, topPad + rowHeight * rows + 10],
    });
  }, [autoScaleMode, activeMetricIds, rows, metricsHeight]);

  const yGroup = useMemo(() => {
    if (autoScaleMode !== 'GROUP' || !activeGroup) return null;

    // fixed domain for index100
    if (activeGroup === 'index100') {
      return scaleLinear<number>({
        domain: [0, 100],
        range: [topPad + rowHeight * rows + metricsHeight - 10, topPad + rowHeight * rows + 10],
      });
    }

    // otherwise compute min/max across the active metrics (over visible domain for responsiveness)
    const [vd0, vd1] = viewDomain;
    const toNum = (d: Date) => d.getTime();
    const vals: number[] = [];
    for (const s of metricSeries) {
      if (!activeMetricIds.includes(s.id)) continue;
      if (unitGroup[s.id] !== activeGroup) continue;
      for (const p of s.points) {
        const t = new Date(p.t);
        if (toNum(t) >= toNum(vd0) && toNum(t) <= toNum(vd1)) vals.push(p.value);
      }
    }
    if (!vals.length) return null;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = (max - min) * 0.1 || 10;

    return scaleLinear<number>({
      domain: [min - pad, max + pad],
      range: [topPad + rowHeight * rows + metricsHeight - 10, topPad + rowHeight * rows + 10],
    });
  }, [autoScaleMode, activeGroup, activeMetricIds, rows, metricsHeight, viewDomain]);

  // NORMALIZED overlay: shared 0–100
  const yNormalized = useMemo(() => {
    const top = topPad + rowHeight * rows + 10;
    const bottom = topPad + rowHeight * rows + metricsHeight - 10;
    return scaleLinear<number>({ domain: [0, 100], range: [bottom, top] });
  }, [rows, metricsHeight]);

  // Per-series visible extents for normalization
  const visibleExtents = useMemo(() => {
    const [vd0, vd1] = viewDomain;
    const toNum = (d: Date) => d.getTime();
    return Object.fromEntries(
      metricSeries.map((s) => {
        const pts = s.points.filter((p) => {
          const t = new Date(p.t).getTime();
          return t >= toNum(vd0) && t <= toNum(vd1);
        });
        if (!pts.length) return [s.id, { min: 0, max: 1 }];
        const vals = pts.map((p) => p.value);
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        return [s.id, { min, max: max === min ? min + 1 : max }];
      })
    );
  }, [viewDomain]);

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
          {/* Show events */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400 mr-1">Show events:</span>

            {/* ALL (events) */}
            <button
              className={pillAllTeal(allTypesOn)}
              onClick={() => setEnabledTypes(setAllRecord(typeKeys, !allTypesOn))}
              title={allTypesOn ? 'Hide all events' : 'Show all events'}
            >
              All
            </button>

            {/* Individual event pills */}
            {typeKeys.map((t) => {
              const active = enabledTypes[t];
              return (
                <button
                  key={t}
                  onClick={() => setEnabledTypes((prev) => ({ ...prev, [t]: !prev[t] }))}
                  className={pillClasses(active)}
                >
                  <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: typeColors[t] }} />
                  <span className="capitalize">{t}</span>
                </button>
              );
            })}
          </div>

          {/* Show metrics */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400 mr-1">Show metrics:</span>

            {/* ALL (metrics) */}
            <button
              className={pillAllBlue(allMetricsOn)}
              onClick={() => setEnabledSeries(setAllRecord(metricKeys as any, !allMetricsOn))}
              title={allMetricsOn ? 'Hide all metrics' : 'Show all metrics'}
            >
              All
            </button>

            {/* Individual metric pills */}
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
        className={clsx('relative border rounded-xl shadow-lg overflow-hidden', bgPanel, 'h-[75vh]')}
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
                <svg width={contentWidth} height={chartH}>
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
                    return <line key={i} x1={x} x2={x} y1={0} y2={chartH} stroke={gridStroke} strokeWidth={1} />;
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
                  {filteredSeries.map((s) => {
                    // choose y scale
                    const yFor = (val: number) => {
                      if (autoScaleMode === 'SINGLE' && ySingle) return ySingle(val);
                      if (autoScaleMode === 'GROUP' && yGroup) return yGroup(val);
                      const { min, max } = visibleExtents[s.id];
                      const norm = ((val - min) / (max - min)) * 100;
                      return yNormalized(norm);
                    };

                    return (
                      <g key={s.id}>
                        <LinePath
                          data={s.points}
                          x={(d) => xScale(new Date(d.t))}
                          y={(d) => yFor(d.value)}
                          stroke={seriesColor[s.id]}
                          strokeWidth={2}
                          strokeOpacity={0.9}
                        />

                        {s.points.map((p, i) => {
                          const cx = xScale(new Date(p.t));
                          const cy = yFor(p.value);
                          return (
                            <g key={i}>
                              {/* big hit area */}
                              <circle
                                cx={cx}
                                cy={cy}
                                r={14}
                                fill="transparent"
                                stroke="transparent"
                                style={{ pointerEvents: 'all' }}
                                onMouseEnter={(evt) => {
                                  const lp = localPoint(evt) as { x: number; y: number };
                                  let extra: string | null = null;
                                  if (autoScaleMode === 'NORMALIZED') {
                                    const { min, max } = visibleExtents[s.id];
                                    const norm = ((p.value - min) / (max - min)) * 100;
                                    extra = ` • ${norm.toFixed(0)}%`;
                                  }
                                  setHover({
                                    x: lp.x,
                                    y: lp.y,
                                    content: (
                                      <div>
                                        <div className="font-semibold">{s.label}</div>
                                        <div className="opacity-80">{format(new Date(p.t), 'PP p')}</div>
                                        <div>
                                          {p.value}
                                          {s.unit ? ` ${s.unit}` : ''}
                                          {extra}
                                        </div>
                                      </div>
                                    ),
                                  });
                                }}
                                onMouseLeave={() => setHover(null)}
                              />
                              <circle cx={cx} cy={cy} r={3} fill={seriesColor[s.id]} />
                            </g>
                          );
                        })}
                      </g>
                    );
                  })}

                  {/* Events */}
                  {events.map((e) => {
                    const x = xScale(new Date(e.timestamp));
                    const row = rowsByType[e.type];
                    const cy = topPad + row * rowHeight + rowHeight / 2;
                    const baseColor = typeColors[e.type];
                    const Icon = eventIcon[e.type] ?? ClipboardList;

                    // choose nodeColor (life events can override)
                    const nodeColor =
                      e.type === 'life' ? (e.meta?.valence === 'negative' ? '#ff6b6b' : '#8cff66') : baseColor;

                    const NODE_R = 20;

                    // guide line
                    // y-position of the bottom time axis baseline (before the +padding used in the Axis group)
                    const axisBaselineY = topPad + rows * rowHeight + metricsHeight;
                    const guideY1 = cy + NODE_R + 2; // just below the big node
                    const guideY2 = axisBaselineY - 2;

                    return (
                      <g
                        key={e.id}
                        transform={`translate(${x}, ${cy})`}
                        className="cursor-pointer"
                        onMouseEnter={(evt) => {
                          const lp = localPoint(evt) as { x: number; y: number };
                          setHover({
                            x: lp.x,
                            y: lp.y,
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
                        onClick={() => alert(`${e.label}\n${new Date(e.timestamp).toLocaleString()}`)}
                      >
                        {/* BIG HIT AREA for easy hover/click */}
                        <circle r={30} fill="transparent" stroke="transparent" style={{ pointerEvents: 'all' }} />

                        {/* dashed guide into metrics area */}
                        <line
                          x1={0}
                          x2={0}
                          y1={guideY1 - cy}
                          y2={guideY2 - cy}
                          stroke={nodeColor}
                          strokeOpacity={0.45}
                          strokeDasharray="4 6"
                        />

                        {/* outer glow */}
                        <circle r={26} fill="none" stroke={nodeColor} strokeOpacity={0.25} />

                        {/* main disk */}
                        <circle r={20} fill={nodeColor} stroke="#0b0f1c" strokeWidth={2} />

                        {/* inner contrast disk to help icons pop */}
                        <circle r={16} fill="#0d1629" opacity={0.3} />

                        {/* icon (centered) */}
                        <g transform="translate(-12,-12)">
                          <Icon size={24} color="#e6f4ff" strokeWidth={2} />
                        </g>

                        {/* hover halo */}
                        <circle r={32} fill="none" stroke={nodeColor} strokeOpacity={0.18} />
                      </g>
                    );
                  })}

                  {/* Left Axis (SINGLE or GROUP) */}
                  {(autoScaleMode === 'SINGLE' || autoScaleMode === 'GROUP') && (ySingle || yGroup) && (
                    <g>
                      <g transform={`translate(${paddingLeft - 40},0)`}>
                        <AxisLeft
                          scale={autoScaleMode === 'SINGLE' ? ySingle! : yGroup!}
                          stroke={axisStroke}
                          tickStroke={axisStroke}
                          tickLabelProps={() => ({
                            fontSize: 11,
                            fill: axisLabel,
                            textAnchor: 'end',
                            dy: '0.3em',
                          })}
                        />
                      </g>

                      {/* Axis unit label */}
                      {activeGroup && (
                        <text
                          x={paddingLeft - 56}
                          y={topPad + rowHeight * rows + metricsHeight / 2}
                          fill={axisLabel}
                          fontSize={11}
                          transform={`rotate(-90, ${paddingLeft - 56}, ${topPad + rowHeight * rows + metricsHeight / 2})`}
                          textAnchor="middle"
                        >
                          {activeGroup === 'mmHg'
                            ? 'mmHg'
                            : activeGroup === 'lb'
                              ? 'lb'
                              : activeGroup === 'index100'
                                ? 'Score (0–100)'
                                : ''}
                        </text>
                      )}
                    </g>
                  )}

                  {/* Axis */}
                  <g transform={`translate(0, ${topPad + rows * rowHeight + metricsHeight + 10})`}>
                    <AxisBottom
                      scale={xScale}
                      stroke={axisStroke}
                      tickStroke={axisStroke}
                      // You can keep tickLabelProps if you want, but tickComponent will win
                      tickComponent={({ x, y, formattedValue }) => {
                        const isYear = !isNaN(Number(formattedValue)); // e.g. "2022" → true, "Jan" → false

                        return (
                          <g transform={`translate(${x}, ${y})`}>
                            <text
                              fontSize={isYear ? 28 : 18}
                              fontWeight={isYear ? 700 : 500}
                              fill={isYear ? '#ffb020' : axisLabel} // year standout color
                              textAnchor="middle"
                              dy={isYear ? '2em' : '1em'} // offset years lower
                            >
                              {formattedValue}
                            </text>
                          </g>
                        );
                      }}
                    />
                  </g>
                </svg>

                {/* Tooltip + clamping*/}
                {hover && (
                  <div
                    className="absolute z-30 pointer-events-none bg-[#0f172a] text-slate-100 border border-slate-700 rounded-md shadow px-3 py-2 text-xs"
                    style={{
                      left: clamp(hover.x + tooltipOffset, 8, contentWidth - 300),
                      top: clamp(hover.y + tooltipOffset, 8, chartH - 100),
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
