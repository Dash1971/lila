package lila.user

import java.text.Normalizer
import java.util.Locale

/** Shared uniqueness keys; canonical account identity always remains reserved. */
object PublicNameKeys:
  def normalize(name: String): String =
    Normalizer.normalize(name, Normalizer.Form.NFKC).trim.toLowerCase(Locale.ROOT)

  def apply(canonical: String, display: Option[String]): List[String] =
    (normalize(canonical) :: display.map(normalize).filter(_.nonEmpty).toList).distinct
