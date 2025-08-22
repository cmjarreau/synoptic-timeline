export type TimelineEventType =
  | 'diagnosis'
  | 'medication'
  | 'lab'
  | 'procedure'
  | 'complaint'
  | 'imaging'
  | 'vital'
  | 'life'; // positive/negative life events

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  label: string;
  timestamp: string;
  meta?: Record<string, any>;
}

export interface MetricPoint {
  t: string; // ISO
  value: number; // numeric value
}

export interface MetricSeries {
  id: 'weight' | 'systolic' | 'diastolic' | 'sleepScore' | 'stressIndex';
  label: string;
  unit?: string;
  points: MetricPoint[];
}

export const mockPatientEvents: TimelineEvent[] = [
  {
    id: 'e1',
    type: 'diagnosis',
    label: 'Type 2 Diabetes',
    timestamp: '2022-01-12T00:00:00Z',
    meta: { icd10: 'E11.9' },
  },
  {
    id: 'e2',
    type: 'medication',
    label: 'Metformin 500mg start',
    timestamp: '2022-01-20T00:00:00Z',
    meta: { dose: '500mg BID' },
  },
  { id: 'e3', type: 'lab', label: 'HbA1c 8.1%', timestamp: '2022-03-01T00:00:00Z', meta: { value: 8.1, units: '%' } },
  { id: 'e4', type: 'procedure', label: 'Knee arthroscopy', timestamp: '2022-06-15T00:00:00Z', meta: { side: 'left' } },
  {
    id: 'e5',
    type: 'life',
    label: 'Marriage (positive)',
    timestamp: '2022-09-10T00:00:00Z',
    meta: { valence: 'positive' },
  },
  { id: 'e6', type: 'complaint', label: 'Fatigue reported', timestamp: '2022-11-02T00:00:00Z' },
  { id: 'e7', type: 'imaging', label: 'DEXA: mild osteopenia', timestamp: '2023-02-01T00:00:00Z' },
  {
    id: 'e8',
    type: 'medication',
    label: 'Metformin ↑ to 1000mg',
    timestamp: '2023-05-05T00:00:00Z',
    meta: { dose: '1000mg BID' },
  },
  {
    id: 'e9',
    type: 'life',
    label: 'Parent passing (stressful)',
    timestamp: '2023-07-22T00:00:00Z',
    meta: { valence: 'negative' },
  },
  { id: 'e10', type: 'lab', label: 'HbA1c 6.6%', timestamp: '2023-10-01T00:00:00Z', meta: { value: 6.6, units: '%' } },
  {
    id: 'e11',
    type: 'vital',
    label: 'Weight 188 lb',
    timestamp: '2024-01-01T00:00:00Z',
    meta: { value: 188, units: 'lbs' },
  },
  { id: 'e12', type: 'complaint', label: 'Sleep disturbance', timestamp: '2024-04-01T00:00:00Z' },
  {
    id: 'e13',
    type: 'life',
    label: 'New job (positive)',
    timestamp: '2024-08-15T00:00:00Z',
    meta: { valence: 'positive' },
  },
  { id: 'e14', type: 'lab', label: 'HbA1c 6.2%', timestamp: '2025-03-01T00:00:00Z', meta: { value: 6.2, units: '%' } },
];

export const metricSeries: MetricSeries[] = [
  {
    id: 'weight',
    label: 'Weight',
    unit: 'lbs',
    points: [
      { t: '2022-01-01T00:00:00Z', value: 196 },
      { t: '2022-06-01T00:00:00Z', value: 193 },
      { t: '2023-01-01T00:00:00Z', value: 191 },
      { t: '2023-06-01T00:00:00Z', value: 189 },
      { t: '2024-01-01T00:00:00Z', value: 188 },
      { t: '2024-08-01T00:00:00Z', value: 186 },
      { t: '2025-03-01T00:00:00Z', value: 184 },
    ],
  },
  {
    id: 'systolic',
    label: 'BP Systolic',
    unit: 'mmHg',
    points: [
      { t: '2022-01-01Z', value: 132 },
      { t: '2022-06-01Z', value: 128 },
      { t: '2023-01-01Z', value: 125 },
      { t: '2023-06-01Z', value: 129 },
      { t: '2024-01-01Z', value: 124 },
      { t: '2024-08-01Z', value: 121 },
      { t: '2025-03-01Z', value: 122 },
    ],
  },
  {
    id: 'diastolic',
    label: 'BP Diastolic',
    unit: 'mmHg',
    points: [
      { t: '2022-01-01Z', value: 86 },
      { t: '2022-06-01Z', value: 82 },
      { t: '2023-01-01Z', value: 80 },
      { t: '2023-06-01Z', value: 83 },
      { t: '2024-01-01Z', value: 79 },
      { t: '2024-08-01Z', value: 78 },
      { t: '2025-03-01Z', value: 77 },
    ],
  },
  {
    id: 'sleepScore',
    label: 'Sleep Score',
    unit: '',
    points: [
      { t: '2022-01-01Z', value: 65 },
      { t: '2022-09-01Z', value: 74 },
      { t: '2023-07-01Z', value: 60 }, // dip around negative life event
      { t: '2024-01-01Z', value: 67 },
      { t: '2024-08-01Z', value: 72 },
      { t: '2025-03-01Z', value: 76 },
    ],
  },
  {
    id: 'stressIndex',
    label: 'Stress Index',
    unit: '',
    points: [
      { t: '2022-01-01Z', value: 40 },
      { t: '2022-09-15Z', value: 35 }, // positive event dip
      { t: '2023-07-22Z', value: 75 }, // negative spike
      { t: '2024-01-01Z', value: 55 },
      { t: '2024-08-15Z', value: 45 }, // positive event dip
      { t: '2025-03-01Z', value: 42 },
    ],
  },
];

export const patientProfile = {
  name: 'Jane Doe',
  age: 52,
  sex: 'F',
  dob: '1973-05-10',
  mrn: '123456',
};
