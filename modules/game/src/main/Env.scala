package lila.game

import com.softwaremill.macwire.*
import com.softwaremill.tagging.*
import org.apache.pekko.actor.*
import org.apache.pekko.stream.Materializer
import play.api.Configuration
import play.api.libs.ws.StandaloneWSClient

import lila.common.autoconfig.{ *, given }
import lila.core.config.*

final private class GameConfig(
    @ConfigName("collection.game") val gameColl: CollName,
    @ConfigName("collection.crosstable") val crosstableColl: CollName,
    @ConfigName("collection.matchup") val matchupColl: CollName,
    @ConfigName("captcher.duration") val captcherDuration: FiniteDuration,
    val gifUrl: String
)

@Module
final class Env(
    appConfig: Configuration,
    ws: StandaloneWSClient,
    db: lila.db.Db,
    yoloDb: lila.db.AsyncDb @@ lila.db.YoloDb,
    routeUrl: RouteUrl,
    userApi: lila.core.user.UserApi,
    mongoCache: lila.memo.MongoCache.Api,
    lightUserApi: lila.core.user.LightUserApi,
    cacheApi: lila.memo.CacheApi,
    getTourName: => lila.core.tournament.GetTourName,
    fideIdOf: lila.core.user.PublicFideIdOf
)(using scheduler: Scheduler)(using Executor, Materializer):
  private val config = appConfig.get[GameConfig]("game")(using AutoConfig.loader)

  private val noSweatGames = db(CollName("nosweat_game"))
  private val noSweatOnly = appConfig.getOptional[Boolean]("nosweat.enabled").getOrElse(false)
  private val studyRun = appConfig.getOptional[String]("nosweat.study.runId").getOrElse("")
  private val studyEnabled = appConfig.getOptional[Boolean]("nosweat.study.enabled").getOrElse(false) &&
    NoSweatStudyScope.valid(
      studyRun,
      appConfig.get[String]("mongodb.uri"),
      appConfig.get[String]("mongodb.yolo.uri"),
      appConfig.get[String]("net.domain"),
      appConfig.getOptional[Boolean]("nosweat.study.publicRatings").getOrElse(false)
    )
  private val studyGames = db(CollName("nosweat_study_game"))
  private def admitNoSweat(game: lila.core.game.Game): Funit =
    import lila.db.dsl.{ *, given }
    if !noSweatOnly || !game.playable then funit
    else if game.clock.isEmpty || game.daysPerTurn.isDefined then
      fufail(NoSweatGameAdmission.RealTimeRequired)
    else if game.variant.standard && game.sourceIs(_.Friend) && game.userIds.distinct.size == 2 then
      // Native ChallengeJoiner and Rematcher enforce invitation ownership/consent.
      // Keep their Friend source path; human pool/lobby games still require Maia admission.
      userApi
        .byIds(game.userIds)
        .flatMap: users =>
          if users.size == 2 && users.forall(u => u.enabled.yes && !u.isBot) then funit
          else fufail("Friend games require two enabled human accounts")
    else if studyEnabled && game.variant.standard && game.sourceIs(_.Pool) && game.rated.yes &&
      game.userIds.distinct.size == 2
    then
      studyGames
        .byId[lila.db.dsl.Bdoc](game.id)
        .flatMap:
          case None => admitHumanPool(game)
          case Some(doc) =>
            val allowed = doc.getAsOpt[String]("runId").contains(studyRun) &&
              doc.getAsOpt[String]("state").contains("reserved") &&
              doc.getAsOpt[UserId]("white").contains(game.whitePlayer.userId.get) &&
              doc.getAsOpt[UserId]("black").contains(game.blackPlayer.userId.get)
            if !allowed then fufail("No study reservation")
            else
              userApi
                .byIds(game.userIds)
                .flatMap: users =>
                  if users.size == 2 && users.forall(u => u.enabled.yes && u.isBot) then funit
                  else fufail("Study games require two enabled BOT accounts")
    else admitHumanPool(game)

  private def admitHumanPool(game: lila.core.game.Game): Funit =
    import lila.db.dsl.{ *, given }
    noSweatGames
      .byId[lila.db.dsl.Bdoc](game.id)
      .flatMap: reservation =>
        val allowed = reservation.exists: doc =>
          val bot = doc.getAsOpt[UserId]("bot")
          val human = doc.getAsOpt[UserId]("human")
          val seats = bot.exists(game.userIds.contains) && human.fold(
            game.userIds.size == 1 && game.rated.no && doc.getAsOpt[String]("guest").isDefined
          )(id => game.userIds.distinct.size == 2 && game.userIds.contains(id) && !bot.contains(id))
          seats && game.variant.standard && game.sourceIs(_.Pool) &&
          doc.getAsOpt[String]("state").contains("reserved") &&
          doc.getAsOpt[Boolean]("rated").contains(game.rated.yes)
        val automatic = appConfig.getOptional[Boolean]("nosweat.activity.enabled").getOrElse(false) &&
          reservation.exists: doc =>
            doc.getAsOpt[Boolean]("automatic").contains(true) &&
              doc.getAsOpt[String]("state").contains("reserved") &&
              doc.getAsOpt[Boolean]("rated").contains(true) && game.rated.yes &&
              game.variant.standard && game.sourceIs(_.Pool) && game.userIds.distinct.size == 2 &&
              doc.getAsOpt[UserId]("white") == game.whitePlayer.userId &&
              doc.getAsOpt[UserId]("black") == game.blackPlayer.userId
        if automatic then
          userApi
            .byIds(game.userIds)
            .flatMap: users =>
              if users.size == 2 && users.forall(u => u.isBot && u.enabled.yes) then funit
              else fufail("Automatic games require two enabled BOT accounts")
        else if allowed then funit
        else fufail("Game has no Maia pool reservation")

  private val noSweatActivity = db(CollName("nosweat_activity"))
  val noSweatAdmission = new NoSweatGameAdmission(
    () =>
      import lila.db.dsl.{ *, given }
      noSweatActivity.byId[Bdoc]("public").map(_.flatMap(_.getAsOpt[Boolean]("paused")).getOrElse(false))
    ,
    paused =>
      import lila.db.dsl.{ *, given }
      noSweatActivity.update.one(bid("public"), set("paused" -> paused), upsert = true).void
  )

  val gameRepo = GameRepo(db(config.gameColl), admitNoSweat, Option.when(noSweatOnly)(noSweatAdmission))

  given idGenerator: IdGenerator = wire[IdGenerator]

  val divider = wire[Divider]

  val gameOpening = wire[GameOpening]

  val gameOpeningOf: lila.core.game.GameOpening = gameOpening.of

  val cached: Cached = wire[Cached]

  val uciMemo = wire[UciMemo]

  lazy val gifExport = GifExport(ws, lightUserApi, routeUrl, config.gifUrl)

  lazy val paginator = wire[PaginatorBuilder]

  lazy val pgnDump = wire[PgnDump]

  lazy val crosstableApi = new CrosstableApi(
    coll = db(config.crosstableColl),
    matchupColl = yoloDb(config.matchupColl).failingSilently()
  )

  lazy val gamesByUsersStream = wire[GamesByUsersStream]
  lazy val gamesByIdsStream = wire[GamesByIdsStream]

  lazy val favoriteOpponents = wire[FavoriteOpponents]

  lazy val rematches = wire[Rematches]

  lazy val jsonView = wire[JsonView]

  lazy val captcha = wire[CaptchaApi]

  lazy val importer = wire[lila.game.importer.Importer]

  lazy val userGameApi = UserGameApi(lightUserApi, getTourName)

  lazy val api: lila.core.game.GameApi = new:
    export gameRepo.{ incBookmarks, getSourceAndUserIds, countNowPlaying }
    export GameExt.{ computeMoveTimes, analysable }
    export AnonCookie.json as anonCookieJson

  given newPlayer: lila.core.game.NewPlayer = new:
    export Player.make as apply
    override def anon(color: Color, aiLevel: Option[Int] = None) =
      Player.makeAnon(color, aiLevel)

  val namer: lila.core.game.Namer = Namer

  scheduler.scheduleWithFixedDelay(config.captcherDuration, config.captcherDuration): () =>
    captcha.newCaptcha()
