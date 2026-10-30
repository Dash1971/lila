package lila.bot

class ManagedPresenceTest extends munit.FunSuite:
  test("healthy 10,000-bot heartbeats publish once; expiry and recovery publish one transition each"):
    var now = 0L
    var events = Vector.empty[Set[UserId]]
    val ids = (0 until 10000).map(i => UserId(s"bot$i")).toSet
    val presence = new ManagedPresence(10000, () => now, next => events :+= next)
    assertEquals(presence.activeIds, Set.empty[UserId])
    presence.heartbeat(ids)
    for _ <- 0 until 100 do
      now += 1000
      presence.heartbeat(ids)
      presence.expire()
    assertEquals(events, Vector(ids))
    now += 10000
    presence.expire()
    presence.expire()
    assertEquals(events, Vector(ids, Set.empty))
    assertEquals(presence.activeIds, Set.empty[UserId])
    presence.heartbeat(ids)
    assertEquals(events, Vector(ids, Set.empty, ids))

  test("a roster replacement publishes the replacement without ghost identities"):
    var latest = Set.empty[UserId]
    val presence = new ManagedPresence(10000, () => 0, next => latest = next)
    presence.heartbeat(Set(UserId("oldbot")))
    presence.heartbeat(Set(UserId("newbot")))
    assertEquals(latest, Set(UserId("newbot")))
