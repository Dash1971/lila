package lila.bot

/** One expiring health lease for a managed roster, not one timer per account. */
private[bot] final class ManagedPresence(
    ttlMillis: Long,
    now: () => Long,
    publish: Set[UserId] => Unit
):
  private var ids = Set.empty[UserId]
  private var online = false
  private var until = 0L

  def heartbeat(next: Set[UserId]): Unit = synchronized:
    until = now() + ttlMillis
    val changed = !online || ids != next
    ids = next
    online = true
    if changed then publish(ids)

  def expire(): Unit = synchronized:
    if online && now() >= until then
      online = false
      publish(Set.empty)

  def activeIds: Set[UserId] = synchronized:
    if online then ids else Set.empty
