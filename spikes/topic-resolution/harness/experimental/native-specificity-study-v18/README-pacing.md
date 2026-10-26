# Origin pacing across study batches

The pacing adapter preserves the maximum observed robots delay for each fixed
panel-primary origin across batches. It does not grant collection rights: the
original policy collector still makes all robots and TDM decisions on the same
untouched responses. A delay learned before a later TDM failure remains in force.

Policy dispatch and page starts are spaced under the original60-second policy
budget. After physical batch teardown, the actual drain ACK and row release,
every batch-primary origin receives a conservative closed-batch contact stamp.
This accounts for browser requests that occurred after page start. Delays larger
than the remaining budget produce unavailability, not a shortened delay.

TRAIN results retain only sorted origin/delay metadata, not raw policy responses
or clock values. The independently authenticated TEST admission returns this
metadata. TEST starts its own clock and waits the full saved delay before first
contact; clocks from separate processes are never compared.

Tests use invented clocks and responses with the unchanged policy collector and
robots parser. They establish pacing/order contracts, not actual collection or
network isolation. Execution remains separately gated.
