# Kafka Cluster Topology & Partitioning

## 1. Topics, Partitions, and Consumer Groups
- **Topic:** Logical category or stream name.
- **Partition:** Append-only commit log. The fundamental unit of parallelism and scale in Kafka.
- **Consumer Group:** A set of cooperating processes consuming a topic. Each partition is assigned to exactly one consumer within the group.

## 2. Consumer Rebalance Protocols
- **Eager Rebalance (Default in older versions):** All consumers stop processing, drop all partition assignments, and rejoin the group. Causes latency spikes.
- **Cooperative Sticky Assignor (Modern Standard):** Consumers only surrender partitions that need to be migrated to another worker. Unaffected partitions continue processing without interruption.
