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

const MIN_BY_GROUP: Partial<Record<UnitGroup, number>> = {
  lbs: 0,
  index100: 0,
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

  const rows = Math.max(...Object.values(rowsByType)) + 1;
  const rowHeight = 36;
  const axisHeight = 40;
  const paddingLeft = 70;
  const basePaddingRight = 40;
  const rightPad = basePaddingRight;

  const baseContentWidth = 2200;
  const topPad = 70;

  const [runwayPx, setRunwayPx] = useState(800); // initial future area
  const totalWidth = baseContentWidth + (projection ? Math.max(600, runwayPx) : 0);

  const chartInset = 30;
  const baseRangeRight = baseContentWidth - rightPad;

  const [hover, setHover] = useState<{ x: number; y: number; content: React.ReactNode } | null>(null);
  const { ref: viewportRef, width: viewportW, height: viewportH } = useContainerSize<HTMLDivElement>();
  const chartH = viewportH || rows * rowHeight + 140 + axisHeight + topPad;

  const metricsHeight = Math.max(
    140, // minimum metrics area
    Math.round(chartH * 0.45)
  );

  const effectiveDomain: [Date, Date] = useMemo(() => viewDomain, [viewDomain, projection]);

  // x-scale
  const xScale = useMemo(
    () => scaleTime<number>({ domain: effectiveDomain, range: [paddingLeft + chartInset, baseRangeRight] }),
    [effectiveDomain, baseRangeRight, paddingLeft]
  );

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

    const g = unitGroup[id]; // e.g., 'lbs'
    const hardMin = MIN_BY_GROUP[g] ?? null;
    const lower = hardMin != null ? Math.min(min - pad, hardMin) : min - pad;

    return scaleLinear<number>({
      domain: [lower, max + pad],
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

    const hardMin = MIN_BY_GROUP[activeGroup] ?? null; // 'lbs' -> 0
    const lower = hardMin != null ? Math.min(min - pad, hardMin) : min - pad;

    return scaleLinear<number>({
      domain: [lower, max + pad],
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

  const initialScale = useMemo(() => Math.min(1, (viewportW || 1) / (baseContentWidth + 600)), [viewportW]);

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

  const twRef = useRef<ReactZoomPanPinchRef | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // rAF throttle for buttery updates
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<{ dx: number; dy: number } | null>(null);
  React.useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  // Convert screen pointer to *content* coordinates (pre-zoom/pan)
  function toContentXY(clientX: number, clientY: number) {
    const el = svgRef.current!;
    const rect = el.getBoundingClientRect(); // reflects CSS transforms
    const x = ((clientX - rect.left) / rect.width) * totalWidth;
    const y = ((clientY - rect.top) / rect.height) * chartH;
    return { x, y };
  }

  // Normalize mouse/touch to clientX/clientY
  function getClientXY(evt: any) {
    if (evt?.touches?.[0]) {
      const t = evt.touches[0];
      return { clientX: t.clientX, clientY: t.clientY };
    }
    return { clientX: evt?.clientX ?? 0, clientY: evt?.clientY ?? 0 };
  }

  const projectionReadout = useMemo(() => {
    if (!projection) return null;

    const id: MetricSeries['id'] = projection.metricId; // "weight"
    const anchor = lastPointOf(id);
    if (!anchor) return null;

    // anchor pixel coords
    const x1 = xScale(anchor.t);

    // helper: pixel->ms using the current visible domain and base range
    const rangePx = baseRangeRight - (paddingLeft + chartInset);
    const domainMs = viewDomain[1].getTime() - viewDomain[0].getTime();
    const msPerPx = domainMs / Math.max(1, rangePx);

    // project time: add dx * msPerPx to the anchor *time*
    const futureTs = new Date(anchor.t.getTime() + projection.dx * msPerPx);

    // we render y with: yEnd = y1 - projection.dy (positive dy = up)
    // recover y1 (anchor y) with the same scale mode
    const y1 = (() => {
      if (autoScaleMode === 'SINGLE' && ySingle) return ySingle(anchor.v);
      if (autoScaleMode === 'GROUP' && yGroup) return yGroup(anchor.v);
      const { min, max } = visibleExtents[id];
      const pct = ((anchor.v - min) / (max - min)) * 100;
      return yNormalized(pct);
    })();

    const yEnd = y1 - projection.dy;

    // invert yEnd -> value (lbs)
    const toValueFromY = (yPx: number) => {
      if (autoScaleMode === 'SINGLE' && ySingle) return ySingle.invert(yPx);
      if (autoScaleMode === 'GROUP' && yGroup) return yGroup.invert(yPx);
      const { min, max } = visibleExtents[id];
      const pct = (yNormalized.range()[0] - yPx) / (yNormalized.range()[0] - yNormalized.range()[1]); // 0..1
      return min + pct * (max - min);
    };

    const vFuture = toValueFromY(yEnd);
    const delta = vFuture - anchor.v;
    const daysAhead = Math.round((projection.dx * msPerPx) / 86_400_000);

    return { t: futureTs, v: vFuture, delta, daysAhead };
  }, [
    projection,
    xScale,
    ySingle,
    yGroup,
    yNormalized,
    visibleExtents,
    viewDomain,
    baseRangeRight,
    paddingLeft,
    chartInset,
  ]);

  function dateFromDx(dxPx: number, anchorDate: Date) {
    const [r0, r1] = (xScale as any).range();
    const spanPx = (r1 as number) - (r0 as number);
    const spanMs = viewDomain[1].getTime() - viewDomain[0].getTime();
    const msPerPx = spanMs / spanPx;
    return new Date(anchorDate.getTime() + dxPx * msPerPx);
  }

  // Invert the y-value back to the metric value using the active scale mode
  function valueFromY(y: number, id: MetricSeries['id']) {
    if (autoScaleMode === 'SINGLE' && ySingle) return ySingle.invert(y);
    if (autoScaleMode === 'GROUP' && yGroup) return yGroup.invert(y);
    // NORMALIZED: yNormalized is 0–100, then map back using visibleExtents
    const pct = yNormalized.invert(y); // 0..100
    const { min, max } = visibleExtents[id];
    return min + (pct / 100) * (max - min);
  }

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
                setProjection({ metricId: 'weight', dx: 30, dy: 50 });
                setRunwayPx((r) => Math.max(r, 600, 300 + 200));
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
          key={`${viewportW}`}
          minScale={Math.min(1, (viewportW || 1) / totalWidth)}
          maxScale={6}
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
                <svg ref={svgRef} width={totalWidth} height={chartH} style={{ touchAction: 'none' }}>
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

                      const yFor = (val: number) => {
                        if (autoScaleMode === 'SINGLE' && ySingle) return ySingle(val);
                        if (autoScaleMode === 'GROUP' && yGroup) return yGroup(val);
                        const { min, max } = visibleExtents[id]; // normalized fallback
                        const norm = ((val - min) / (max - min)) * 100;
                        return yNormalized(norm);
                      };

                      const anchor = lastPointOf(id);
                      if (!anchor) return null;
                      const x1 = xScale(anchor.t);
                      const y1 = yFor(anchor.v);

                      // Calculate x2Draw and y2Draw based on projection deltas
                      const x2Draw = x1 + projection.dx;
                      const y2Draw = y1 - projection.dy;

                      const minX = paddingLeft + 6;
                      const maxX = totalWidth - rightPad - 6;
                      const minY = 6;
                      const maxY = chartH - 6;
                      const metricsTop = topPad + rows * rowHeight + 10;
                      const metricsBottom = topPad + rows * rowHeight + metricsHeight - 10;

                      const x2Right = Math.max(x2Draw, x1 + 10);
                      const y2Right = Math.max(metricsTop, Math.min(metricsBottom, y2Draw));

                      console.log('Rendering Projection with:', { x1, y1, x2Draw, y2Draw, projection }); // ADDED

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
                            x2={x2Draw}
                            y2={y2Draw}
                            stroke={seriesColor[id]}
                            strokeWidth={5}
                            strokeDasharray="8 8"
                            opacity={0.95}
                            pointerEvents="none"
                          />

                          {/* Drag layer for the segment + knob */}
                          <Drag
                            x={projection.dx + x1}
                            y={y1 - projection.dy}
                            width={totalWidth}
                            height={chartH}
                            onDragStart={() => setPanDisabled(true)}
                            onDragEnd={() => setPanDisabled(false)}
                            onDragMove={({ event }) => {
                              if (event == null) return;

                              const { clientX, clientY } = getClientXY(event);
                              const { x: cx, y: cy } = toContentXY(clientX, clientY);

                              // 2) clamp to your metrics band
                              const metricsTop = topPad + rows * rowHeight + 10;
                              const metricsBottom = topPad + rows * rowHeight + metricsHeight - 10;

                              const cxc = Math.max(paddingLeft + 6, Math.min(totalWidth - rightPad - 6, cx));
                              const cyc = Math.max(metricsTop, Math.min(metricsBottom, cy));

                              // 3) compute deltas in content space
                              const nextDx = cxc - x1; // right = +
                              const nextDy = y1 - cyc; // up = + (SVG Y grows downward)

                              // 4) rAF-throttle state updates for smooth animation
                              pendingRef.current = { dx: nextDx, dy: nextDy };
                              if (rafRef.current == null) {
                                rafRef.current = requestAnimationFrame(() => {
                                  const p = pendingRef.current;
                                  if (p) setProjection((prev) => (prev ? { ...prev, ...p } : prev));
                                  pendingRef.current = null;
                                  rafRef.current = null;
                                });
                              }

                              // 5) grow runway when approaching edge
                              if (cxc > baseRangeRight + runwayPx - 150) {
                                setRunwayPx((r) => r + 400);
                              }
                            }}
                          >
                            {({ dragStart, dragEnd, dragMove, isDragging }) => {
                              const handleX = x1 + projection.dx;
                              const handleY = y1 - projection.dy;

                              // live projection readout (date + value + delta)
                              const projDate = dateFromDx(projection.dx, anchor.t);
                              const projVal = valueFromY(handleY, id);
                              const delta = projVal - anchor.v;

                              const series = metricSeries.find((s) => s.id === id)!;
                              const unit = series.unit || (unitGroup[id] === 'lbs' ? 'lbs' : '');
                              return (
                                <g>
                                  {isDragging && (
                                    <rect
                                      x={0}
                                      y={0}
                                      width={totalWidth}
                                      height={chartH}
                                      fill="transparent"
                                      pointerEvents="all"
                                      onMouseMove={dragMove}
                                      onMouseUp={dragEnd}
                                      onTouchMove={dragMove}
                                      onTouchEnd={dragEnd}
                                    />
                                  )}
                                  {/* fat (nearly invisible) hit line so you can grab anywhere */}
                                  <line
                                    x1={x1}
                                    y1={y1}
                                    x2={x1 + projection.dx}
                                    y2={y1 - projection.dy}
                                    stroke={seriesColor[id]}
                                    strokeWidth={16}
                                    strokeOpacity={0.001}
                                    pointerEvents="stroke"
                                    onMouseDown={dragStart}
                                    onMouseMove={dragMove}
                                    onMouseUp={dragEnd}
                                    onTouchStart={dragStart}
                                    onTouchMove={dragMove}
                                    onTouchEnd={dragEnd}
                                  />

                                  {/* handle: large hit circle + visible knob */}
                                  <circle
                                    cx={x1 + projection.dx}
                                    cy={y1 - projection.dy}
                                    r={22}
                                    fill="#fff"
                                    fillOpacity={0.001}
                                    className="cursor-grab"
                                    pointerEvents="all"
                                    onMouseDown={dragStart}
                                    onMouseMove={dragMove}
                                    onMouseUp={dragEnd}
                                    onTouchStart={dragStart}
                                    onTouchMove={dragMove}
                                    onTouchEnd={dragEnd}
                                  />
                                  <circle
                                    cx={x1 + projection.dx}
                                    cy={y1 - projection.dy}
                                    r={8}
                                    fill={seriesColor[id]}
                                    stroke="#0b0f1c"
                                    strokeWidth={2}
                                    pointerEvents="none"
                                  />

                                  {/* simple label showing deltas */}
                                  <g transform={`translate(${handleX + 14}, ${handleY - 10})`} pointerEvents="none">
                                    <rect
                                      x={0}
                                      y={-28}
                                      rx={6}
                                      ry={6}
                                      width={190}
                                      height={64}
                                      fill="#0f172a"
                                      stroke="#1f2a44"
                                    />
                                    <text x={10} y={-10} fill="#e2e8f0" fontSize={12} fontWeight={700}>
                                      {projVal.toFixed(1)} {unit}
                                    </text>
                                    <text x={10} y={6} fill="#94a3b8" fontSize={11}>
                                      {delta >= 0 ? '+' : ''}
                                      {delta.toFixed(1)} {unit} from {anchor.v.toFixed(1)}
                                    </text>
                                    <text x={10} y={22} fill="#94a3b8" fontSize={11}>
                                      {format(projDate, 'PP')}
                                    </text>
                                  </g>
                                </g>
                              );
                            }}
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
