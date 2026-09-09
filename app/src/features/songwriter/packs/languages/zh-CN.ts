/**
 * Ported from Resonant (https://github.com/calesthio/Resonant).
 * Copyright (c) 2026 Resonant and Calesthio. Licensed under AGPL-3.0-only.
 * Songwriting analysis logic ported verbatim for zh-CN (Mandarin Chinese).
 * Requires pinyin-pro for phonetic analysis.
 */

import { pinyin } from "pinyin-pro";
import type { SongSection, SongwritingLanguagePack } from "../types";

const hanGlobal = /\p{Script=Han}/gu;
const latinWord = /[a-z]+/gi;
const segmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });

export function chineseTokens(text: string) {
	return [...segmenter.segment(text.normalize("NFC"))]
		.filter((part) => part.isWordLike)
		.map((part) => part.segment.toLocaleLowerCase("zh-CN"));
}

/** Counts approximate sung syllables: each Han character ≈ 1 syllable, Latin words counted by vowel groups. */
export function chineseSyllables(raw: string) {
	const normalized = raw.normalize("NFC");
	const hanCount = normalized.match(hanGlobal)?.length ?? 0;
	const latinWords = normalized.match(latinWord) ?? [];
	const latinCount = latinWords.reduce(
		(sum, word) =>
			sum + Math.max(1, word.toLowerCase().match(/[aeiouy]+/g)?.length ?? 1),
		0,
	);
	const numericGroups = normalized.match(/\d+/g)?.length ?? 0;
	return hanCount + latinCount + numericGroups;
}

/** Rhyme key from the final Han character's pinyin final, or Latin vowel ending. */
export function chineseRhymeKey(raw: string) {
	const normalized = raw.normalize("NFC");
	const chars = [...normalized];
	const lastHan = chars.reverse().find((c) => /\p{Script=Han}/u.test(c));
	if (lastHan) {
		const py = pinyin(lastHan, { toneType: "none", type: "array" })[0];
		if (py) {
			const final_ = py.replace(/^[bcdfghjklmnpqrstwxyz]*/, "");
			return final_ || py;
		}
	}
	const word = raw.toLowerCase().replace(/[^a-z]/g, "");
	const match = word.match(/[aeiouy][a-z]*$/);
	return match?.[0] ?? word.slice(-2);
}

function countTerms(text: string, terms: string[]) {
	return terms.filter((term) => text.includes(term)).length;
}

function chineseReview(
	draft: { title: string; hook: string; lyrics: string },
	sections: SongSection[],
) {
	const strengths: string[] = [];
	const suggestions: string[] = [];
	const hanCount = draft.lyrics.match(hanGlobal)?.length ?? 0;
	const latinCount = draft.lyrics.match(/[A-Za-z]/g)?.length ?? 0;
	const hookLength = chineseSyllables(draft.hook);
	const hasNativeVerse = sections.some((section) =>
		/ verse | 段| 主歌/.test(section.label),
	);
	const hasNativeChorus = sections.some((section) =>
		/ chorus | 副歌| 高潮/.test(section.label),
	);
	const conversational = countTerms(draft.lyrics, [
		"其实",
		"可是",
		"然后",
		"就是说",
		"你知道吗",
		"真的",
		"好像",
		"可能",
		"对吧",
		"不过",
		"而且",
		"虽然",
	]);
	const cliches = countTerms(draft.lyrics, [
		"永远",
		"命运",
		"星光",
		"奇迹",
		"世界尽头",
		"你是我的光",
		"时光倒流",
		"心跳加速",
		"追逐梦想",
		"展翅高飞",
		"今夜不醉不归",
		"像烟火一样",
		"疯狂地",
		"只有你",
	]);
	const englishRatio = latinCount / Math.max(1, hanCount + latinCount);
	const lineLengths = sections
		.flatMap((section) => section.lines.map(chineseSyllables))
		.filter(Boolean);
	const crowdedLines = lineLengths.filter((length) => length > 14).length;

	if (hasNativeVerse && hasNativeChorus) {
		strengths.push("歌词使用了中文创作中常见的段落标签，便于保留歌曲结构。");
	}
	if (hookLength >= 3 && hookLength <= 8) {
		strengths.push("Hook 足够紧凑，容易记忆和传唱。");
	}
	if (conversational >= 3) {
		strengths.push("歌词读起来像日常说话，不像翻译腔。");
	}
	if (englishRatio >= 0.04 && englishRatio <= 0.25) {
		strengths.push("中英混搭比例恰当，可作为风格点缀。");
	}
	if (!hanCount) {
		suggestions.push("用中文写歌词。拼音注音可以另附，但不应该替代演唱文本。");
	}
	if (englishRatio > 0.3) {
		suggestions.push(
			"英文比例偏高，可能削弱中文表达。保留英文用于 Hook、口号或押韵即可。",
		);
	}
	if (hookLength > 10) {
		suggestions.push("缩短 Hook 到一句话以内，把解释放在前后段落。");
	}
	if (cliches >= 4) {
		suggestions.push(
			"替换掉几个通用的华语流行套话（永远、命运、星光），用具体的场景、动作或私密细节替代。",
		);
	}
	if (crowdedLines >= Math.max(2, Math.ceil(lineLengths.length / 3))) {
		suggestions.push("几行歌词偏长，拆分或简化，让演唱时气息更自然。");
	}
	if (!hasNativeChorus) {
		suggestions.push("添加明确的副歌段落，让它承载歌曲的核心承诺。");
	}
	return { strengths, suggestions };
}

export const chineseSongwriting: SongwritingLanguagePack = {
	id: "zh-CN",
	name: "Mandarin Chinese",
	locale: "zh-CN",
	aliases: ["zh", "Chinese", "Mandarin", "中文", "普通话", "国语"],
	description:
		"Mandarin Chinese songwriting with Han-character syllable meter, pinyin-final rhyme, C-pop structure, and natural spoken detail.",
	templates: [
		{
			id: "c-pop-ballad",
			name: "华语抒情",
			description:
				"Classic Mandopop ballad with verse–chorus arc and a bridge revelation.",
			sections: [
				"前奏",
				"主歌 1",
				"副歌",
				"主歌 2",
				"副歌",
				"间奏",
				"桥段",
				"最终副歌",
				"尾奏",
			],
		},
		{
			id: "c-pop-upbeat",
			name: "华语快歌",
			description:
				"Upbeat C-pop with a hook-first intro and a danceable energy.",
			sections: [
				"前奏 Hook",
				"主歌 1",
				"预副歌",
				"副歌",
				"主歌 2",
				"预副歌",
				"副歌",
				"间奏",
				"桥段",
				"最终副歌",
				"尾奏",
			],
		},
		{
			id: "rap-hip-hop",
			name: "说唱 / 嘻哈",
			description:
				"Narrative rap verses with internal rhyme, flow changes, and a compact hook.",
			sections: [
				"前奏",
				"说唱主歌 1",
				"Hook",
				"说唱主歌 2",
				"Hook",
				"转换",
				"最终 Hook",
				"尾奏",
			],
		},
		{
			id: "r-and-b",
			name: "R&B",
			description:
				"Conversational close-up verses, a smooth lift, and a melody-driven chorus.",
			sections: [
				"前奏",
				"主歌 1",
				"预副歌",
				"副歌",
				"主歌 2",
				"副歌",
				"桥段",
				"副歌",
				"尾奏",
			],
		},
		{
			id: "folk-acoustic",
			name: "民谣 / 原声",
			description:
				"Intimate storytelling with simple structure and space for acoustic instruments.",
			sections: [
				"前奏",
				"主歌 1",
				"主歌 2",
				"副歌",
				"主歌 3",
				"副歌",
				"间奏",
				"尾奏",
			],
		},
	],
	quickSections: ["主歌", "预副歌", "副歌", "说唱主歌", "桥段", "间奏", "尾奏"],
	lyricPlaceholder:
		"[主歌 1]\n用具体的场景开始——时间、地点、动作……\n\n[预副歌]\n逐渐提升节奏和情绪……\n\n[副歌]\n用简短的中文表达核心承诺和标题……",
	sectionAliases: {
		intro: ["前奏", "引子", "序曲", "前奏 Hook"],
		verse: ["主歌", "段", "说唱主歌", "说唱", "段落"],
		"pre-chorus": ["预副歌", "前副歌", "副歌前"],
		chorus: ["副歌", "高潮", "Hook", "最终副歌"],
		"post-chorus": ["后副歌", "副歌后"],
		bridge: ["桥段", "过渡", "转换", "高潮段"],
		breakdown: ["间奏", "器乐段", "过门"],
		outro: ["尾奏", "结尾", "尾声"],
	},
	generatorSectionLabels: {
		前奏: "Intro",
		"前奏 Hook": "Intro Hook",
		"主歌 1": "Verse 1",
		"主歌 2": "Verse 2",
		"主歌 3": "Verse 3",
		"说唱主歌 1": "Rap Verse 1",
		"说唱主歌 2": "Rap Verse 2",
		预副歌: "Pre-Chorus",
		副歌: "Chorus",
		后副歌: "Post-Chorus",
		Hook: "Hook",
		桥段: "Bridge",
		间奏: "Instrumental",
		最终副歌: "Final Chorus",
		尾奏: "Outro",
		转换: "Switch-up",
	},
	cliches: [
		"永远在一起",
		"命运般的爱情",
		"星光下",
		"奇迹般的你",
		"世界尽头",
		"你是我的光",
		"时光倒流",
		"心跳加速",
		"追逐梦想",
		"展翅高飞",
		"今夜不醉不归",
		"像烟火一样",
		"疯狂地",
		"只有你",
	],
	sensoryWords: [
		"深夜",
		"地铁",
		"便利店",
		"十字路口",
		"天台",
		"走廊",
		"练习室",
		"耳机",
		"震动",
		"霓虹",
		"日光灯",
		"雨滴",
		"运动鞋",
		"口红",
		"外套",
		"纸杯",
		"出租车",
		"巷子",
		"电梯",
		"香水",
		"肥皂",
		"灰尘",
		"热气",
		"冰冷的",
		"潮湿的",
		"刺眼的",
		"低语",
		"呼吸声",
		"脚步声",
		"低音",
	],
	tokenize: chineseTokens,
	syllables: chineseSyllables,
	rhymeKey: chineseRhymeKey,
	review: chineseReview,
	coachingGuide: `用自然的普通话写歌词，不要逐字翻译英文语序。中文可以省略主语，把情绪信息放在句尾，让语气词承载关系和态度。决定谁在对谁说话，保持口语风格一致——可以是叙述、独白、对话，或抒情独白。刻意的语体切换可以表达亲密、距离、讽刺或崩溃点，但随意混搭会显得生硬。拼音注音可以另附，但不是演唱文本。

建立一个精准的歌曲承诺和一句简洁的标题短语。在华语流行中，让每个段落承担不同的功能：主歌建立人物和律动；预副歌收束歌词并提升情绪；副歌表达最令人难忘的情感句子；间奏或桥段制造对比和释放。不是每首歌都需要所有段落。

中文歌词的意象优先级：具体的场景、动作、物品、私人细节，比抽象的"永远""命运""星光"更有力量。让每段歌词有画面感。

押韵方面，比较汉字的韵母（用拼音），而不是字形。精确的韵母重复是强韵；相近的韵母颜色、重复的语法结尾、内韵、头韵和节奏对应可以承载较松的流行韵。在说唱中，建立多音节的声链，变化句尾。不要强迫每一句都押同一个韵。

中英混搭是正常的华语流行资源，不是要求。当英文产生更干净的 Hook、人物声音、节奏攻击、韵律或国际可读的口号时使用英文。让切换在语法和情感上是有意的；避免随机散布 baby、crazy、tonight、forever 和 fire。强双语 Hook 通常用一句英文建立，然后用中文回答、重构或完成。

数每个汉字作为一个近似演唱节拍单位。比较相邻行的气息和律动，但允许切分和长元音。密集的辅音过渡在快速段落或高音处可能不清楚，所以在演唱测试时注意，在可能的情况下让主要旋律高点使用开放、可持续的元音。

最后，朗读歌词，拍打节奏，检查中英文切换的自然度，然后用生成的语音试听发音清晰度再确认。`,
};
