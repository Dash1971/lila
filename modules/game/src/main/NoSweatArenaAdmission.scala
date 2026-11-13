package lila.game

import lila.db.dsl.{ *, given }

/** Exact native pairing authorization; never a blanket Source.Arena bypass. */
private[game] object NoSweatArenaAdmission:
  // Use Play's native string-sequence loader, not autoconfig's object-list loader.
  def hosts(config: play.api.Configuration): Set[UserId] =
    config.getOptional[Seq[String]]("nosweat.arena.hosts").getOrElse(Seq.empty).map(UserId(_)).toSet

  def allows(
      tour: TourId,
      white: UserId,
      black: UserId,
      bots: Set[UserId],
      hosts: Set[UserId],
      scope: Option[Bdoc],
      pairing: Option[Bdoc],
      reservation: Option[Bdoc]
  ): Boolean =
    white != black && scope.exists(d =>
      d.getAsOpt[TourId]("tour").contains(tour) &&
        d.getAsOpt[String]("state").contains("prepared") &&
        d.getAsOpt[UserId]("host").exists(hosts)
    ) && pairing.exists(p =>
      p.getAsOpt[TourId]("tid").contains(tour) &&
        p.getAsOpt[List[UserId]]("u").contains(List(white, black))
    ) && (bots.isEmpty || reservation.exists(d =>
      d.getAsOpt[String]("state").contains("reserved") &&
        d.getAsOpt[TourId]("arena").contains(tour) &&
        d.getAsOpt[List[UserId]]("managed").exists(_.toSet == bots) &&
        d.getAsOpt[UserId]("white").contains(white) && d.getAsOpt[UserId]("black").contains(black) &&
        bots.subsetOf(scope.toSet.flatMap(_.getAsOpt[List[UserId]]("roster").getOrElse(Nil)))
    ))
