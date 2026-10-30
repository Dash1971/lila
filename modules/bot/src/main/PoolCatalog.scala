package lila.bot

import scala.collection.immutable.TreeMap
import lila.core.perf.PerfKey

/** Derived index only. Native perfs remain authoritative and are checked at admission. */
final class PoolCatalog:
  private var ratings = Map.empty[UserId, Map[PerfKey, Int]]
  private var pools = Map.empty[PerfKey, TreeMap[Int, Set[UserId]]]

  def replace(entries: Map[UserId, Map[PerfKey, Int]]): Unit = synchronized:
    ratings = Map.empty
    pools = Map.empty
    entries.foreach((id, perfs) => update(id, perfs))

  def update(id: UserId, perfs: Map[PerfKey, Int]): Unit = synchronized:
    ratings
      .get(id)
      .foreach(_.foreach: (key, rating) =>
        val pool = pools(key)
        val ids = pool(rating) - id
        pools = pools.updated(key, if ids.isEmpty then pool.removed(rating) else pool.updated(rating, ids)))
    if perfs.isEmpty then ratings = ratings.removed(id)
    else
      ratings = ratings.updated(id, perfs)
      perfs.foreach: (key, rating) =>
        val pool = pools.getOrElse(key, TreeMap.empty[Int, Set[UserId]])
        pools = pools.updated(key, pool.updated(rating, pool.getOrElse(rating, Set.empty) + id))

  def within(key: PerfKey, rating: Int, excluded: Set[UserId]): Vector[UserId] = synchronized:
    pools
      .get(key)
      .fold(Vector.empty[UserId]): pool =>
        pool
          .rangeFrom(rating - 200)
          .rangeTo(rating + 200)
          .valuesIterator
          .flatMap(_.iterator)
          .filterNot(excluded)
          .toVector
