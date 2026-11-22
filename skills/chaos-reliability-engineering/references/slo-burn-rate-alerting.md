# SLO Mathematical Modeling & Multi-Burn-Rate Alerting

## 1. Service Level Indicators (SLI) & Objectives (SLO)
$$\text{SLI} = \frac{\text{Good Events}}{\text{Valid Events}} \ge \text{SLO} \quad (\text{e.g., } 99.9\%)$$
- Over a 30-day window, a $99.9\%$ SLO permits a **0.1% Error Budget**.

## 2. Multi-Window Multi-Burn-Rate Alerts (Google SRE Standard)
Instead of static threshold alerts that either page too late or fire false alarms on noise:
| Burn Rate | % Budget Consumed | Time to 100% Exhaustion | Long Window | Short Window | Severity |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **14.4x** | 2% | 2 days | 1 hour | 5 minutes | Page (P1) |
| **6x** | 5% | 5 days | 6 hours | 30 minutes | Page (P1) |
| **1x** | 10% | 30 days | 3 days | 6 hours | Ticket (P2) |
