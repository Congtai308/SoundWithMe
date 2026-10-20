import {
  findBestLyrics,
  lyricsQueries,
  normalize,
  parseLrc,
  pickBestLyrics,
  titleSegments,
  type LrclibRecord,
  type LyricsTarget,
} from "../src/modules/music/lyrics/lrc";

const record = (overrides: Partial<LrclibRecord>): LrclibRecord => ({
  trackName: "Song",
  artistName: "Artist",
  duration: 200,
  instrumental: false,
  plainLyrics: "x",
  syncedLyrics: "[00:01.00] x",
  ...overrides,
});

describe("parseLrc", () => {
  it("parses timestamps, multi-stamp lines and sorts", () => {
    expect(parseLrc("[ar: x]\n[00:12.34] a\n[01:02.5]b\n[00:01.00][00:03.00] c\nno stamp")).toEqual([
      { timeMs: 1000, text: "c" },
      { timeMs: 3000, text: "c" },
      { timeMs: 12340, text: "a" },
      { timeMs: 62500, text: "b" },
    ]);
  });
});

describe("normalize", () => {
  it("drops diacritics, đ and punctuation", () => {
    expect(normalize("Sơn Tùng M-TP")).toBe("son tung m tp");
    expect(normalize("Hoàng Thuỳ Linh")).toBe(normalize("Hoàng Thùy Linh"));
    expect(normalize("ĐÔNG THIÊN ĐỨC")).toBe("dong thien duc");
  });
});

describe("titleSegments", () => {
  it.each([
    ["JACK - J97 | LƯU NIÊN | Album TAM THÁI TỬ - Track No.4", ["JACK", "J97", "LƯU NIÊN"]],
    ["SƠN TÙNG M-TP | HÃY TRAO CHO ANH ft. Snoop Dogg | Official MV", ["SƠN TÙNG M-TP", "HÃY TRAO CHO ANH"]],
    ["HIEUTHUHAI - Không Thể Say (prod. by Kewtiie) l Official Video", ["HIEUTHUHAI", "Không Thể Say"]],
    ["(S)TRONG Trọng Hiếu - Kho Báu | Official Music Video", ["(S)TRONG Trọng Hiếu", "Kho Báu"]],
    ["Em Của Ngày Hôm Qua - Sơn Tùng MTP [OFFICIAL MV]", ["Em Của Ngày Hôm Qua", "Sơn Tùng MTP"]],
    ["Dương Domic - Mất Kết Nối | EP 'Dữ Liệu Quý'", ["Dương Domic", "Mất Kết Nối"]],
  ])("%s", (title, segments) => {
    expect(titleSegments(title)).toEqual(segments);
  });
});

describe("lyricsQueries", () => {
  it("tries the whole title, then each part that isn't the channel, without version words", () => {
    expect(
      lyricsQueries({ title: "LƯU NIÊN REMIX (VNN Mix) - JACK - J97", artistName: "VNN Mix", durationMs: 0 }),
    ).toEqual(["LƯU NIÊN REMIX JACK J97", "LƯU NIÊN", "JACK"]);
  });
});

describe("pickBestLyrics", () => {
  const luuNien: LyricsTarget = {
    title: "JACK - J97 | LƯU NIÊN | Album TAM THÁI TỬ - Track No.4",
    artistName: "J97",
    durationMs: 195_000,
  };

  it("rejects another song from the same album, even with a closer length", () => {
    const sameAlbum = record({
      trackName: "JACK - J97 | ANH YÊU EM (我爱你) | Album TAM THÁI TỬ - Track No.3",
      artistName: "Jack - J97",
      duration: 195,
    });
    const right = record({ trackName: "Lưu Niên", artistName: "Jack - J97", duration: 180 });
    expect(pickBestLyrics([sameAlbum], luuNien)).toBeNull();
    expect(pickBestLyrics([sameAlbum, right], luuNien)).toBe(right);
  });

  it("rejects the right title by another artist", () => {
    const target = { title: "MONO - Waiting For You (Album 22 - Track No.10)", artistName: "Mono Official", durationMs: 266_000 };
    expect(pickBestLyrics([record({ trackName: "Waiting For You", artistName: "Someone Else" })], target)).toBeNull();
    expect(pickBestLyrics([record({ trackName: "Waiting For You", artistName: "MONO" })], target)).not.toBeNull();
  });

  it("prefers the original cut over a live / alternate version", () => {
    const target = { title: "Em Của Ngày Hôm Qua - Sơn Tùng MTP [OFFICIAL MV]", artistName: "Sơn Tùng M-TP", durationMs: 246_000 };
    const live = record({ trackName: "Em Của Ngày Hôm Qua (Sky Tour 2019)", artistName: "Sơn Tùng - MTP", duration: 246 });
    const original = record({ trackName: "Em Cua Ngay Hom Qua", artistName: "Son Tung M-TP", duration: 232 });
    expect(pickBestLyrics([live, original], target)).toBe(original);
  });

  it("prefers synced lyrics, then the closest length", () => {
    const target = { title: "Artist - Song", artistName: "Artist", durationMs: 228_000 };
    const plain = record({ syncedLyrics: null, duration: 228 });
    const far = record({ duration: 200 });
    const near = record({ duration: 230 });
    expect(pickBestLyrics([plain, far, near], target)).toBe(near);
  });

  it("finds nothing for a video that isn't a song", () => {
    const target = { title: "How to cook pasta | Easy 10 minute recipe", artistName: "Tasty", durationMs: 300_000 };
    expect(pickBestLyrics([record({ trackName: "Pasta", artistName: "Some Band" })], target)).toBeNull();
  });
});

describe("findBestLyrics", () => {
  it("keeps querying until synced lyrics for the right song turn up", async () => {
    const target = { title: "LƯU NIÊN REMIX (VNN Mix) - JACK - J97", artistName: "VNN Mix", durationMs: 285_000 };
    const right = record({ trackName: "Lưu Niên", artistName: "Jack - J97" });
    const search = jest.fn(async (q: string) => (q === "LƯU NIÊN" ? [right] : []));
    await expect(findBestLyrics(target, search)).resolves.toBe(right);
    expect(search).toHaveBeenCalledTimes(2);
  });
});
