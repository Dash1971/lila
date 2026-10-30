package lila.bot

import lila.core.perf.PerfKey

class PoolCatalogTest extends munit.FunSuite:
  test("10,000 identities preserve the exact rating window, speed and busy exclusion"):
    val catalog = new PoolCatalog
    val entries = (0 until 10000).map: i =>
      UserId(s"bot$i") -> Map(PerfKey.blitz -> (400 + i % 2400), PerfKey.rapid -> (600 + i % 2000))
    val ratings = entries.toMap
    catalog.replace(ratings)
    val busy = Set(UserId("bot700"), UserId("bot800"))
    for key <- List(PerfKey.blitz, PerfKey.rapid); rating <- List(400, 1000, 1500, 2600) do
      val actual = catalog.within(key, rating, busy)
      val expected = ratings.collect:
        case (id, perfs) if math.abs(perfs(key) - rating) <= 200 && !busy(id) => id
      assertEquals(actual.toSet, expected.toSet)
      assertEquals(actual.distinct.size, actual.size)

  test("updates remove old buckets; restart replacement removes retired accounts"):
    val catalog = new PoolCatalog
    val id = UserId("testbot")
    catalog.update(id, Map(PerfKey.blitz -> 1500, PerfKey.rapid -> 1800))
    catalog.update(id, Map(PerfKey.blitz -> 2100, PerfKey.rapid -> 1800))
    assertEquals(catalog.within(PerfKey.blitz, 1500, Set.empty), Vector.empty)
    assertEquals(catalog.within(PerfKey.blitz, 2100, Set.empty), Vector(id))
    assertEquals(catalog.within(PerfKey.rapid, 1800, Set.empty), Vector(id))
    catalog.update(id, Map.empty)
    assertEquals(catalog.within(PerfKey.rapid, 1800, Set.empty), Vector.empty)
    catalog.update(id, Map(PerfKey.blitz -> 1500))
    catalog.replace(Map.empty)
    assertEquals(catalog.within(PerfKey.blitz, 1500, Set.empty), Vector.empty)
