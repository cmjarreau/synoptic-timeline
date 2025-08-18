export type TimelineEventType =
  | 'diagnosis'
  | 'medication'
  | 'lab'
  | 'procedure'
  | 'complaint'
  | 'imaging'
  | 'vital';

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  label: string;
  timestamp: string;
  meta?: Record<string, any>;
}

export const mockPatientEvents: TimelineEvent[] = [
  {
    id: 'event-001',
    type: 'diagnosis',
    label: 'Type 2 Diabetes',
    timestamp: '2021-04-12T00:00:00Z',
    meta: { status: 'active', icd10: 'E11.9' },
  },
  {
    id: 'event-002',
    type: 'medication',
    label: 'Metformin 500mg Start',
    timestamp: '2021-04-15T00:00:00Z',
    meta: { dose: '500mg', frequency: 'BID', route: 'oral' },
  },
  {
    id: 'event-003',
    type: 'lab',
    label: 'HbA1c 8.2%',
    timestamp: '2021-05-01T00:00:00Z',
    meta: { test: 'HbA1c', value: 8.2, units: '%' },
  },
  {
    id: 'event-004',
    type: 'procedure',
    label: 'Knee Surgery',
    timestamp: '2022-01-10T00:00:00Z',
    meta: { location: 'Left knee', surgeon: 'Dr. Smith' },
  },
  {
    id: 'event-005',
    type: 'vital',
    label: 'Weight 190 lbs',
    timestamp: '2022-03-01T00:00:00Z',
    meta: { value: 190, units: 'lbs' },
  },
  {
    id: 'event-006',
    type: 'complaint',
    label: 'Fatigue reported',
    timestamp: '2022-06-10T00:00:00Z',
    meta: { note: 'Persistent fatigue over past 2 weeks' },
  },
  {
    id: 'event-007',
    type: 'lab',
    label: 'HbA1c 6.5%',
    timestamp: '2022-11-01T00:00:00Z',
    meta: { test: 'HbA1c', value: 6.5, units: '%' },
  },
  {
    id: 'event-008',
    type: 'imaging',
    label: 'DEXA Scan',
    timestamp: '2023-03-15T00:00:00Z',
    meta: { result: 'Mild osteopenia' },
  },
  {
    id: 'event-009',
    type: 'vital',
    label: 'Blood Pressure 130/85',
    timestamp: '2023-06-01T00:00:00Z',
    meta: { systolic: 130, diastolic: 85 },
  },
  {
    id: 'event-010',
    type: 'medication',
    label: 'Metformin dosage increased to 1000mg',
    timestamp: '2023-08-01T00:00:00Z',
    meta: { dose: '1000mg', frequency: 'BID', route: 'oral' },
  },
];
