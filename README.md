# synoptic-timeline
An interactive, responsive patient timeline that gives physicians a clear overview of a patient's health journey over time.

# Overview
This repository demonstrates version 1 of the Patient Timeline feature. The chart supports intuitive interactions such as panning, zooming, and scrolling, enabling physicians to explore health data with ease.
![Patient Timeline](./images/PatientTimelineOverview.png)

# Features

## Filterable Events and Metrics
Practitioners can filter the timeline to focus on specific events and metrics, allowing both high-level insights and deep dives into the data.
<br></br>

Before - with all selections
![Filter Before](./images/FilterableEventsAndMetricsBefore.png)
<br></br>

After - on key selections
![Filter After](./images/FilterableEventsAndMetricsAfter.png)

With the filter active, only the chosen events and metrics are shown. Metrics that share common units (e.g. systolic/diastolic blood pressure) display their units on the y-axis. Metrics with uncommon units are normalized for comparability (an area that could be further refined in the next version)


### Weight
When a single Metric is selected, the y-axis highlights its range and units.
![Weight](./images/Weight.png)
<br></br>

### Blood Pressure
When multipl metrics with shared units that are selected, the y-axis reflects those units.
![Blood Pressure](./images/BloodPressure.png)
<br></br>

### Events
Detailed event information is available via hover interactions.
![Event Hoverover Information](./images/EventHoveroverEventInformation.png)

Future iterations will enable correlatiosn between events and metric changes. For example, psychological stressors may influence sleep or blood pressure, while medication changes may alter key metrics.
![Event Hoverover Information Psychological](./images/EventHoveroverEventInformationPsychological.png)

## Future Projections
The timeline can be extended into the future, allowing users to model possible health outcomes - for example, projecting the impact of losing 10lbs over a given period. 
<br></br>
Toggle the Projections button:
<br></br>

![Future Projection Off](./images/FutureProjectionOff.png)
![Future Projection On](./images/FutureProjectionOn.png)

Once enabled, the chart expands and allows the user to set future metric states for specific dates.
![Future Projection Graph](./images/FutureProjectionGraph.png)

With access to comprehensive patient data, precision medicine becomes possible: clinicians can model health outcomes tailored to the individual. Importantly, projecting changes to a single metric (for example a 10lb weight reduction) is likely to impact other related metrics. This interconnected modeling makes the timeline a powerful tool - much like tuning a car, adjusting one parameter can potentially reveal how the whole system responds. As data accumulates over time, these projections become increasingly accurate, providing clinicians and patiens with actionable insights for long-term health.