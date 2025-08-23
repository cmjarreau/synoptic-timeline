import React, { useMemo, useRef, useState } from 'react';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { scaleTime, scaleLinear } from '@visx/scale';
import { LinePath } from '@visx/shape';
import { localPoint } from '@visx/event';
import clsx from 'clsx';
import { format } from 'date-fns';
import {
  mockPatientEvents,
  metricSeries,
  TimelineEventType,
  MetricSeries,
  patientProfile,
} from '../data/mockPatientData';
import { curveMonotoneX, curveCatmullRom, curveBasis } from '@visx/curve';
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
import { Drag } from '@visx/drag';
import { ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';

// helper methods -
type Projection = {
  metricId: MetricSeries['id'];
  dx: number;
  dy: number;
};

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

type UnitGroup = 'lbs' | 'mmHg' | 'index100' | 'other';
type SmoothMode = 'straight' | 'monotone' | 'catmull' | 'basis';

const unitGroup: Record<MetricSeries['id'], UnitGroup> = {
  weight: 'lbs',
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
// const anyTrue = <T extends string>(rec: Record<T, boolean>) => Object.values(rec).some(Boolean);

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

const stop =
  <E extends React.SyntheticEvent<any>>(fn?: (e: E) => void) =>
  (e: E) => {
    e.preventDefault();
    e.stopPropagation();
    fn?.(e);
  };

function defaultPositiveDelta(seriesId: MetricSeries['id']) {
  const s = metricSeries.find((m) => m.id === seriesId);
  if (!s) return 10;
  const vals = s.points.map((p) => p.value);
  const span = Math.max(10, Math.max(...vals) - Math.min(...vals));
  return Math.round(span * 0.25); // ~25% of span
}

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

  const [smooth, setSmooth] = useState<SmoothMode>('monotone');
  const [panDisabled, setPanDisabled] = useState(false);

  const curveFactory =
    smooth === 'monotone'
      ? curveMonotoneX
      : smooth === 'catmull'
        ? curveCatmullRom.alpha(0.5) // 0.0–1.0 tension
        : smooth === 'basis'
          ? curveBasis
          : undefined; // straight segments

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

  const [projection, setProjection] = useState<Projection | null>(null);

  // const metricsHeight = 140;
  const rows = Math.max(...Object.values(rowsByType)) + 1;
  const rowHeight = 36;
  const axisHeight = 40;
  const paddingLeft = 70;
  const basePaddingRight = 40;
  // const projectionPad = projection ? 300 : 0;
  const rightPad = basePaddingRight;

  const baseContentWidth = 2200;
  const projectionRunwayPx = projection ? Math.max(600, Math.ceil(projection.dx) + 200) : 0;
  const totalWidth = baseContentWidth + projectionRunwayPx;

  const topPad = 70;
  // const contentHeight = rows * rowHeight + metricsHeight + axisHeight + topPad;
  // const contentWidth = 2200;
  // const contentWidth = months * baseWidthPerMonth + paddingLeft + paddingRight;

  const [hover, setHover] = useState<{ x: number; y: number; content: React.ReactNode } | null>(null);
  const { ref: viewportRef, width: viewportW, height: viewportH } = useContainerSize<HTMLDivElement>();
  const chartH = viewportH || rows * rowHeight + 140 + axisHeight + topPad;

  const metricsHeight = Math.max(
    140, // minimum metrics area
    Math.round(chartH * 0.45)
  );

  // Extend the visible domain 6 months into the future when projection is enabled
  // const effectiveDomain: [Date, Date] = useMemo(() => {
  //   const [d0, d1] = viewDomain;
  //   if (!projection) return [d0, d1];
  //   const extended = new Date(d1);
  //   extended.setMonth(extended.getMonth() + 6); // +6 months runway
  //   return [d0, extended];
  // }, [viewDomain, projection]);
  const effectiveDomain: [Date, Date] = useMemo(() => viewDomain, [viewDomain, projection]);

  const chartInset = 30;
  const baseRangeRight = baseContentWidth - rightPad;
  // x-scale
  const xScale = useMemo(
    () => scaleTime<number>({ domain: effectiveDomain, range: [paddingLeft + chartInset, baseRangeRight] }),
    [effectiveDomain, baseRangeRight, paddingLeft]
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
    return Math.min(1, viewportW / totalWidth);
  }, [viewportW, totalWidth]);

  // helper to clamp tooltip
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  const tooltipOffset = 12;

  // convenience
  const lastPointOf = (id: MetricSeries['id']) => {
    const s = metricSeries.find((m) => m.id === id);
    if (!s) return null;
    const last = s.points[s.points.length - 1];
    return { t: new Date(last.t), v: last.value };
  };

  const toDate = (x: number) =>
    xScale.invert
      ? (xScale.invert(x) as Date)
      : new Date(
          viewDomain[0].getTime() +
            (viewDomain[1].getTime() - viewDomain[0].getTime()) *
              ((x - (xScale as any).range()[0]) / ((xScale as any).range()[1] - (xScale as any).range()[0]))
        );

  const twRef = useRef<ReactZoomPanPinchRef | null>(null);

  const getZoomState = () => {
    // support both shapes: {state} or {transformState}
    const s: any = twRef.current?.state ?? (twRef.current as any)?.transformState;
    return {
      scale: Number(s?.scale) || 1,
      positionX: Number(s?.positionX) || 0,
      positionY: Number(s?.positionY) || 0,
    };
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-wide text-slate-100">Patient Timeline</h1>
          </div>
          {/* Range chips */}
          <div className="flex items-center gap-2">
            {(['1M', '3M', '6M', '1Y', 'ALL'] as const).map((r) => (
              <button key={r} onClick={() => setRange(r)} className={chipClasses(range === r)}>
                {r}
              </button>
            ))}
            <div className="ml-3 h-5 w-px bg-[#1c2a46]" />
            {(['straight', 'monotone', 'catmull', 'basis'] as const).map((m) => (
              <button key={m} onClick={() => setSmooth(m)} className={chipClasses(smooth === m)}>
                {m === 'straight' ? 'Sharp' : m === 'monotone' ? 'Smooth' : m === 'catmull' ? 'Catmull' : 'Basis'}
              </button>
            ))}

            <button
              className={chipClasses(!!projection)}
              onClick={() => {
                if (projection) {
                  setProjection(null);
                  return;
                }
                const lp = lastPointOf('weight');
                if (!lp) return;
                // default goal = -20 lbs in ~3 months
                // const end = new Date(lp.t);
                // end.setMonth(end.getMonth() + 3);
                setProjection({ metricId: 'weight', dx: 30, dy: -50 });
              }}
            >
              {projection ? 'Projection: On' : 'Add Weight Projection'}
            </button>
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
        <div className="absolute top-2 left-2 z-30 bg-[#0f172a]/60 border border-slate-700 rounded-lg px-4 py-3 shadow-lg backdrop-blur-sm">
          <h2 className="text-lg font-semibold text-slate-100">{patientProfile.name}</h2>
          <div className="text-sm text-slate-300 space-y-0.5">
            <div>
              <span className="font-medium">Age:</span> {patientProfile.age}
            </div>
            <div>
              <span className="font-medium">Sex:</span> {patientProfile.sex}
            </div>
            <div>
              <span className="font-medium">DOB:</span> {patientProfile.dob}
            </div>
            <div>
              <span className="font-medium">MRN:</span> {patientProfile.mrn}
            </div>
          </div>
        </div>
        {/* neon HUD border glow */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ boxShadow: 'inset 0 0 40px rgba(33,212,253,0.08), inset 0 0 60px rgba(183,33,255,0.06)' }}
        />
        <TransformWrapper
          ref={twRef}
          key={`${viewportW}-${totalWidth}`}
          minScale={Math.min(1, (viewportW || 1) / totalWidth)}
          maxScale={6}
          // initialScale={Math.min(1, (viewportW || 1) / totalWidth)}
          initialScale={initialScale}
          centerOnInit
          wheel={{ step: 0.08 }}
          doubleClick={{ disabled: true }}
          // panning={{ disabled: !!projection, velocityDisabled: true }}
          panning={{ disabled: panDisabled, velocityDisabled: true }}
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
                <svg width={totalWidth} height={chartH}>
                  {/* alternating stripes */}
                  {Array.from({ length: rows }).map((_, i) => (
                    <rect
                      key={i}
                      x={paddingLeft}
                      y={topPad + i * rowHeight}
                      width={totalWidth - paddingLeft - rightPad} // CHANGED
                      height={rowHeight}
                      fill={i % 2 === 0 ? bgStripeA : bgStripeB}
                    />
                  ))}

                  {/* faint vertical grid */}
                  {Array.from({ length: 24 }).map((_, i) => {
                    const x = paddingLeft + i * ((totalWidth - rightPad - paddingLeft) / 24); // CHANGED
                    return <line key={i} x1={x} x2={x} y1={0} y2={chartH} stroke={gridStroke} strokeWidth={1} />;
                  })}

                  {/* Metric tracks background */}
                  <rect
                    x={paddingLeft}
                    y={topPad + rows * rowHeight}
                    width={totalWidth - paddingLeft - rightPad}
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
                          strokeWidth={5}
                          strokeOpacity={0.9}
                          curve={curveFactory}
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
                        onClick={() => {}}
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

                  {projection &&
                    enabledSeries[projection.metricId] &&
                    (() => {
                      const id = projection.metricId;

                      // y scale picker (unchanged)
                      const yFor = (val: number) => {
                        if (autoScaleMode === 'SINGLE' && ySingle) return ySingle(val);
                        if (autoScaleMode === 'GROUP' && yGroup) return yGroup(val);
                        const { min, max } = visibleExtents[id]; // normalized fallback
                        const norm = ((val - min) / (max - min)) * 100;
                        return yNormalized(norm);
                      };

                      // Anchor at the *last* real data point for the chosen metric
                      const base = (() => {
                        const s = metricSeries.find((m) => m.id === id)!;
                        const last = s.points[s.points.length - 1];
                        return { t: new Date(last.t), v: last.value };
                      })();

                      const x1 = xScale(base.t);
                      const y1 = yFor(base.v);

                      // End = start + numeric vector
                      const x2 = x1 + projection.dx;
                      const y2 = y1 + projection.dy;

                      // Safety: keep the end point inside the drawing area so it's draggable
                      const minX = paddingLeft + 6;
                      const maxX = totalWidth - rightPad - 6;
                      const minY = 6;
                      const maxY = chartH - 6;

                      const x2Draw = Math.max(minX, Math.min(maxX, x2));
                      const y2Draw = Math.max(minY, Math.min(maxY, y2));

                      // Keep vector rightward so it never flips backward
                      const x2Right = Math.max(x2Draw, x1 + 10);
                      const y2Right = y2Draw;

                      // Label numbers: compute Δvalue from dy (optional; remove if you don't care)
                      let valueDeltaText = '';
                      try {
                        const vEnd =
                          autoScaleMode === 'SINGLE' && ySingle
                            ? ySingle.invert(y2Right)
                            : autoScaleMode === 'GROUP' && yGroup
                              ? yGroup.invert(y2Right)
                              : (() => {
                                  const { min, max } = visibleExtents[id];
                                  const pct =
                                    ((yNormalized.domain()[0] - y2Right) /
                                      (yNormalized.domain()[0] - yNormalized.domain()[1])) *
                                    100;
                                  return min + (pct / 100) * (max - min);
                                })();
                        valueDeltaText = `Δ≈ ${(vEnd - base.v).toFixed(1)}`;
                      } catch {}

                      return (
                        <g style={{ pointerEvents: 'all' }}>
                          {/* guide shading under the metrics area*/}
                          <rect
                            x={baseRangeRight}
                            y={topPad + rows * rowHeight}
                            width={Math.max(0, totalWidth - rightPad - baseRangeRight)}
                            height={metricsHeight}
                            fill="#1b2642"
                            opacity={0.12}
                            pointerEvents="none"
                          />

                          {/* dashed projection */}
                          <line
                            x1={x1}
                            y1={y1}
                            x2={x2Right}
                            y2={y2Right}
                            stroke={seriesColor[id]}
                            strokeWidth={5}
                            strokeDasharray="8 8"
                            opacity={0.95}
                            pointerEvents="none"
                          />

                          {/* Drag layer for the segment + knob */}
                          <Drag
                            x={x2Right}
                            y={y2Right}
                            width={totalWidth}
                            height={chartH}
                            onDragMove={({ x, y }) => {
                              if (x == null || y == null) return;

                              const { scale, positionX, positionY } = getZoomState();
                              // Map pointer to SVG content coordinates
                              const visibleLeft = Math.max(0, -positionX / scale);
                              const visibleTop = Math.max(0, -positionY / scale);
                              const cx = visibleLeft + x / scale;
                              const cy = visibleTop + y / scale;

                              // Compute vector from start; force rightward
                              const dx = Math.max(10, cx - x1);
                              const dy = cy - y1;

                              setProjection((prev) => (prev ? { ...prev, dx, dy } : prev));
                            }}
                          >
                            {({ dragStart, dragEnd, dragMove }) => (
                              <g>
                                {/* fat (nearly invisible) hit line so you can grab anywhere */}
                                <line
                                  x1={x1}
                                  y1={y1}
                                  x2={x2Right}
                                  y2={y2Right}
                                  stroke={seriesColor[id]}
                                  strokeWidth={16}
                                  strokeOpacity={0.001}
                                  pointerEvents="stroke"
                                  onMouseDown={stop(dragStart)}
                                  onMouseMove={stop(dragMove)}
                                  onMouseUp={dragEnd}
                                  onTouchStart={stop(dragStart)}
                                  onTouchMove={stop(dragMove)}
                                  onTouchEnd={dragEnd}
                                />

                                {/* handle: large hit circle + visible knob */}
                                <circle
                                  cx={x2Right}
                                  cy={y2Right}
                                  r={22}
                                  fill="#fff"
                                  fillOpacity={0.001}
                                  className="cursor-grab"
                                  pointerEvents="all"
                                  onMouseDown={stop(dragStart)}
                                  onMouseMove={stop(dragMove)}
                                  onMouseUp={dragEnd}
                                  onTouchStart={stop(dragStart)}
                                  onTouchMove={stop(dragMove)}
                                  onTouchEnd={dragEnd}
                                />
                                <circle
                                  cx={x2Right}
                                  cy={y2Right}
                                  r={8}
                                  fill={seriesColor[id]}
                                  stroke="#0b0f1c"
                                  strokeWidth={2}
                                  pointerEvents="none"
                                />

                                {/* simple label showing deltas */}
                                <g transform={`translate(${x2Right + 14}, ${y2Right - 10})`}>
                                  <rect
                                    x={0}
                                    y={-22}
                                    rx={6}
                                    ry={6}
                                    width={150}
                                    height={48}
                                    fill="#0f172a"
                                    stroke="#1f2a44"
                                  />
                                  <text x={10} y={-6} fill="#e2e8f0" fontSize={12} fontWeight={600}>
                                    dx: {(x2Right - x1).toFixed(0)} px
                                  </text>
                                  <text x={10} y={10} fill="#94a3b8" fontSize={11}>
                                    {valueDeltaText}
                                  </text>
                                </g>
                              </g>
                            )}
                          </Drag>
                        </g>
                      );
                    })()}

                  {/* Left Axis (SINGLE or GROUP) */}
                  {(autoScaleMode === 'SINGLE' || autoScaleMode === 'GROUP') && (ySingle || yGroup) && (
                    <g>
                      <g transform={`translate(${paddingLeft},0)`}>
                        <AxisLeft
                          scale={autoScaleMode === 'SINGLE' ? ySingle! : yGroup!}
                          stroke={axisStroke}
                          tickStroke={axisStroke}
                          tickComponent={({ x, y, formattedValue }) => (
                            <g transform={`translate(${x}, ${y})`}>
                              <text
                                fontSize={20}
                                fontWeight={600}
                                fill={axisLabel}
                                textAnchor="end"
                                dx="{-20}"
                                dy="0.35em"
                              >
                                {formattedValue}
                              </text>
                            </g>
                          )}
                        />
                      </g>

                      {/* Axis unit label */}
                      {activeGroup && (
                        <text
                          x={paddingLeft + 200}
                          y={topPad + rowHeight * rows + metricsHeight / 2}
                          fill={axisLabel}
                          fontSize={18}
                          transform={`rotate(-90, ${paddingLeft - 25}, ${topPad + rowHeight * rows + metricsHeight / 2})`}
                          textAnchor="middle"
                        >
                          {activeGroup === 'mmHg'
                            ? 'mmHg'
                            : activeGroup === 'lbs'
                              ? 'lbs'
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

                {hover && (
                  <div
                    className="absolute z-30 pointer-events-none bg-[#0f172a] text-slate-100 border border-slate-700 rounded-md shadow px-3 py-2 text-xs"
                    style={{
                      left: clamp(hover.x + tooltipOffset, 8, totalWidth - 300),
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
