package lila.bot

import lila.common.Bus
import lila.core.perf.UserWithPerfs
import lila.core.socket.{ ApiUserIsOnline, IsOnline, ManagedApiUsersOnline }
import lila.memo.CacheApi.{ buildAsyncTimeout, invalidate }
import lila.memo.ExpireCallbackMemo

final class OnlineApiUsers(
    isOnline: IsOnline,
    cacheApi: lila.memo.CacheApi,
    userApi: lila.core.user.UserApi,
    jsonView: lila.core.user.JsonView,
    scheduler: Scheduler
)(using Executor, Scheduler):

  val cacheTtl = 10.seconds

  private val cache = ExpireCallbackMemo[UserId](
    scheduler,
    cacheTtl,
    userId => publish(userId, isOnline = false)
  )

  def setOnline(userId: UserId): Unit =
    val wasOffline = !isOnline.exec(userId) && !cache.get(userId)
    cache.put(userId)
    if wasOffline then publish(userId, isOnline = true)

  private val managed: ManagedPresence = new ManagedPresence(
    cacheTtl.toMillis,
    () => System.nanoTime() / 1_000_000,
    ids =>
      usersCache.invalidate({})
      jsonCache.invalidate({})
      Bus.pub(ManagedApiUsersOnline(ids))
  )

  scheduler.scheduleWithFixedDelay(1.second, 1.second)(() => managed.expire())

  def setManagedOnline(ids: Set[UserId]): Unit = managed.heartbeat(ids)

  private def publish(userId: UserId, isOnline: Boolean) =
    Bus.pub(ApiUserIsOnline(userId, isOnline))

  private val usersCache = cacheApi.unit[List[UserWithPerfs]]("onlineApiUsers.list"):
    _.expireAfterWrite(cacheTtl).buildAsyncTimeout(): _ =>
      userApi.visibleBotsByIds(cache.keySet ++ managed.activeIds)

  def getUsers = usersCache.get({})

  private val jsonCache = cacheApi.unit[String]("onlineApiUsers.json"):
    _.expireAfterWrite(cacheTtl).buildAsyncFuture: _ =>
      for
        users <- getUsers
        jsons = users.map(u => jsonView.full(u.user, u.perfs.some, withProfile = true)(using none))
      yield jsons.map(play.api.libs.json.Json.stringify).mkString("\n")

  def getNdJson(nb: Int): Fu[String] =
    for all <- jsonCache.get({})
    yield all.linesIterator.take(nb).mkString("\n")

object OnlineApiUsers:
  case object SetOnline
  case object CheckOnline
