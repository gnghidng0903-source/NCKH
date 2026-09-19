<?php
declare(strict_types=1);

/** Làm sạch bảng hỏi đầu vào và chuẩn hoá/kiểm tra kết quả thô từ AI. */
final class Validator
{
    public const SKIN_TYPES = ['dry', 'normal', 'oily', 'combination', 'sensitive'];
    public const CONCERNS   = ['tight', 'flaking', 'dull', 'pigment', 'acne', 'redness', 'aging', 'large_pores'];

    /** Bảng hỏi từ client → mảng an toàn. */
    public static function questionnaire(array $in): array
    {
        $skinSelf = (string) ($in['skin_type_self'] ?? 'unknown');
        $sunscreen = (string) ($in['sunscreen'] ?? 'unknown');
        $pregnant = (string) ($in['pregnant'] ?? 'na');
        $concerns = array_values(array_intersect(self::CONCERNS, array_map('strval', (array) ($in['concerns'] ?? []))));

        return [
            'skin_type_self'  => in_array($skinSelf, array_merge(self::SKIN_TYPES, ['unknown']), true) ? $skinSelf : 'unknown',
            'concerns'        => $concerns,
            'sleep_hours'     => self::numOrNull($in['sleep_hours'] ?? null, 0, 24),
            'water_liters'    => self::numOrNull($in['water_liters'] ?? null, 0, 10),
            'sunscreen'       => in_array($sunscreen, ['daily', 'sometimes', 'never'], true) ? $sunscreen : 'unknown',
            'pregnant'        => in_array($pregnant, ['yes', 'no', 'na'], true) ? $pregnant : 'na',
            'age'             => self::numOrNull($in['age'] ?? null, 5, 110),
            'allergies'       => self::text($in['allergies'] ?? '', 300),
            'current_routine' => self::text($in['current_routine'] ?? '', 600),
            'notes'           => self::text($in['notes'] ?? '', 600),
        ];
    }

    /** Chuẩn hoá kết quả thô từ AI theo danh mục sản phẩm. */
    public static function normalize(array $raw, array $catalog): array
    {
        $quality = (string) ($raw['image_quality'] ?? 'fair');
        if (!in_array($quality, ['good', 'fair', 'poor'], true)) {
            $quality = 'fair';
        }
        $skinType = (string) ($raw['skin_type'] ?? 'normal');
        if (!in_array($skinType, self::SKIN_TYPES, true)) {
            $skinType = 'normal';
        }

        $recs = [];
        foreach ((array) ($raw['recommendations'] ?? []) as $r) {
            if (!is_array($r)) {
                continue;
            }
            $pid = (string) ($r['product_id'] ?? '');
            if (!isset($catalog[$pid]) || isset($recs[$pid])) {
                continue; // bỏ sản phẩm không có trong danh mục / trùng
            }
            $p = $catalog[$pid];
            $u = $p['usage'] ?? [];
            $maxTimes = max(1, (int) ($u['max_times_per_day'] ?? 2));
            $minWeeks = max(1, (int) ($u['min_weeks'] ?? 2));
            $maxWeeks = max($minWeeks, (int) ($u['max_weeks'] ?? 12));
            $timing = (string) ($r['timing'] ?? 'both');
            $recs[$pid] = [
                'product_id'     => $pid,
                'name'           => (string) ($p['name'] ?? $pid),
                'category'       => (string) ($p['category'] ?? ''),
                'price'          => $p['price'] ?? null,
                'currency'       => (string) ($p['currency'] ?? 'VND'),
                'how'            => (string) ($u['how'] ?? ''),
                'dose'           => self::text($r['dose'] ?? ($u['dose_guide'] ?? ''), 200) ?: (string) ($u['dose_guide'] ?? ''),
                'times_per_day'  => min($maxTimes, max(1, (int) ($r['times_per_day'] ?? 1))),
                'timing'         => in_array($timing, ['morning', 'evening', 'both'], true) ? $timing : 'both',
                'duration_weeks' => min($maxWeeks, max($minWeeks, (int) ($r['duration_weeks'] ?? $minWeeks))),
                'notes'          => self::text($r['notes'] ?? '', 300),
            ];
            if (count($recs) >= 3) {
                break;
            }
        }

        return [
            'is_face'             => (bool) ($raw['is_face'] ?? false),
            'image_quality'       => $quality,
            'quality_issues'      => self::textList($raw['quality_issues'] ?? [], 4, 160),
            'metrics'             => [
                'hydration_pct'    => self::pct($raw['hydration_pct'] ?? 0),
                'pigmentation_pct' => self::pct($raw['pigmentation_pct'] ?? 0),
                'oil_pct'          => self::pct($raw['oil_pct'] ?? 0),
                'pores_score'      => self::pct($raw['pores_score'] ?? 0),
                'wrinkles_score'   => self::pct($raw['wrinkles_score'] ?? 0),
                'overall_score'    => self::pct($raw['overall_score'] ?? 0),
            ],
            'skin_type'           => $skinType,
            'confidence'          => self::pct($raw['confidence'] ?? 50),
            'summary'             => self::text($raw['summary'] ?? '', 500),
            'observations'        => self::textList($raw['observations'] ?? [], 6, 240),
            'needs_dermatologist' => (bool) ($raw['needs_dermatologist'] ?? false),
            'precautions'         => self::textList($raw['precautions'] ?? [], 5, 240),
            'recheck_after_days'  => min(60, max(7, (int) ($raw['recheck_after_days'] ?? 28))),
            'recommendations'     => array_values($recs),
        ];
    }

    /** Trả về lý do từ chối (hiển thị cho người dùng) nếu ảnh không dùng được; null nếu ổn. */
    public static function rejection(array $normalized): ?string
    {
        if (!$normalized['is_face']) {
            return 'Ảnh không có khuôn mặt rõ ràng. Hãy chụp chính diện, mặt không đeo kính/khẩu trang.';
        }
        if ($normalized['image_quality'] === 'poor') {
            $why = $normalized['quality_issues'] ? ' (' . implode('; ', $normalized['quality_issues']) . ')' : '';
            return 'Chất lượng ảnh chưa đủ để phân tích' . $why . '. Hãy chụp lại nơi đủ sáng, không bị mờ hoặc phủ filter.';
        }
        return null;
    }

    private static function pct(mixed $v): int
    {
        return (int) round(min(100, max(0, is_numeric($v) ? (float) $v : 0)));
    }

    private static function numOrNull(mixed $v, float $min, float $max): int|float|null
    {
        if ($v === null || $v === '' || !is_numeric($v)) {
            return null;
        }
        $n = min($max, max($min, (float) $v));
        return floor($n) == $n ? (int) $n : round($n, 1);
    }

    private static function text(mixed $v, int $max): string
    {
        $s = trim(preg_replace('/\s+/u', ' ', strip_tags((string) $v)) ?? '');
        return mb_substr($s, 0, $max);
    }

    private static function textList(mixed $v, int $maxItems, int $maxLen): array
    {
        $out = [];
        foreach ((array) $v as $item) {
            $t = self::text($item, $maxLen);
            if ($t !== '') {
                $out[] = $t;
            }
            if (count($out) >= $maxItems) {
                break;
            }
        }
        return $out;
    }
}
