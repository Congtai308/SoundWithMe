import { artistParts, isGoodSong, pickDistinct, songKeys, type PoolSong } from "../src/modules/lobby/song-picks";

const song = (id: string, title: string, artistName?: string, durationMs = 220_000): PoolSong => ({ id, title, artistName, durationMs });

describe("isGoodSong", () => {
  it.each([
    "HIEUTHUHAI - Exit Sign (prod. by Kewtiie) | Official MV",
    "Sơn Tùng M-TP | CHÚNG TA CỦA TƯƠNG LAI | OFFICIAL MUSIC VIDEO",
    "Ngày Mai Người Ta Lấy Chồng - Acoustic Cover",
  ])("keeps a song: %s", (title) => expect(isGoodSong(song("a", title))).toBe(true));

  it.each([
    "Nhạc Trẻ Hot TikTok 2026 - Tuyển Tập Những Bài Hay Nhất",
    "LIÊN KHÚC NHẠC TRẺ REMIX",
    "lofi hip hop radio 🎧 beats to study to #shorts",
    "Top 20 Nhạc Hot Nhất Tháng 10",
    "Chill Mix 2026 | Nhạc Lofi",
    "3 giờ nhạc chill học bài",
    "Karaoke Hẹn Ước Từ Hư Vô - Tone Nữ",
    "Anh Trai Say Hi - Tập 6 FULL",
    "Reaction: HIEUTHUHAI new MV",
    "TOP 50 BÀI HÁT V-POP HAY NHẤT",
    "50 Bài Hát Nhạc Trẻ Hay Nhất 2026",
    "Tổng Hợp Những Bài Hát Của HIEUTHUHAI",
    "Những Ca Khúc Hay Nhất Của Sơn Tùng M-TP",
    "Nhạc Trẻ Hay Nhất Tháng 10",
  ])("drops what isn't one song: %s", (title) => expect(isGoodSong(song("a", title))).toBe(false));

  it("takes only artists' official videos for official-only rooms", () => {
    expect(isGoodSong(song("a", "MONO - 'Em Xinh' (Official Music Video)"), true)).toBe(true);
    expect(isGoodSong(song("a", "BÍCH PHƯƠNG - Bùa Yêu (M/V)"), true)).toBe(true);
    expect(isGoodSong(song("a", "tlinh - nếu lúc đó | OFFICIAL VISUALIZER"), true)).toBe(true);
    expect(isGoodSong(song("a", "Em Xinh - MONO (Lyrics)"), true)).toBe(false);
    expect(isGoodSong(song("a", "Em Xinh - MONO (Lyrics)"), false)).toBe(true);
  });

  it("drops clips and hour-long videos", () => {
    expect(isGoodSong(song("a", "Some Song", undefined, 60_000))).toBe(false);
    expect(isGoodSong(song("a", "Some Song", undefined, 15 * 60_000))).toBe(false);
  });

  it("drops Shorts, even with a song-like title and length", () => {
    const short = { ...song("a", "How much was The Beatles rooftop rig?", undefined, 167_000), vertical: true };
    expect(isGoodSong(short)).toBe(false);
    expect(isGoodSong({ ...short, vertical: false })).toBe(true);
  });
});

describe("songKeys", () => {
  it("names the song, not the upload", () => {
    const mv = songKeys("MONO - 'Waiting For You' (Official Music Video)");
    const lyrics = songKeys("Waiting For You - MONO | Lyrics Video");
    const cover = songKeys("Waiting For You (Acoustic Cover) - Some Cover Artist");
    expect(mv.some((key) => lyrics.includes(key))).toBe(true);
    expect(mv.some((key) => cover.includes(key))).toBe(true);
  });

  it("tells different songs by one artist apart", () => {
    const titles = ["HIEUTHUHAI - Không Thể Say | Official MV", "HIEUTHUHAI - Ngủ Một Mình | Official MV"];
    const artists = artistParts(titles.map((title) => ({ title, artistName: "HIEUTHUHAI" })));
    const [a, b] = titles.map((title) => songKeys(title, artists));
    expect(a!.some((key) => b!.includes(key))).toBe(false);
  });

  it("spots an artist without the channel name, from their many songs", () => {
    const artists = artistParts(
      ["Vũ. - Lạ Lùng", "Vũ. - Bước Qua Nhau", "Vũ. - Những Lời Hứa Bỏ Quên", "GREY D - Vaicaunoicokhiennguoithaydoi"].map((title) => ({
        title,
        artistName: "Vie Channel",
      })),
    );
    expect(artists.has("vu")).toBe(false); // too short to be a key at all
    const many = artistParts(["Bùi Trường Linh - Đường Tôi Chở Em Về", "Bùi Trường Linh - Dù Cho Mai Về Sau", "Bùi Trường Linh - Từng Là"].map((title) => ({ title })));
    expect(many.has("bui truong linh")).toBe(true);
  });
});

describe("pickDistinct", () => {
  it("never queues the same song twice, nor one already taken", () => {
    const pool = [
      song("1", "Vũ. - Bước Qua Mùa Cô Đơn (Official MV)", "Vũ. Official"),
      song("2", "Bước Qua Mùa Cô Đơn - Vũ. | Lyric Video", "Lyrics Hub"),
      song("3", "Vũ. - Lạ Lùng (Official MV)", "Vũ. Official"),
      song("4", "Chillies - Vì Anh Đâu Có Biết (Official MV)", "Chillies"),
      song("5", "Chillies - Mascara | Official Music Video", "Chillies"),
    ];
    for (let run = 0; run < 20; run++) {
      const picks = pickDistinct(pool, [{ title: "Vì Anh Đâu Có Biết - Chillies (Live)", artistName: "Chillies" }], 10);
      const ids = picks.map((p) => p.id);
      expect(ids.includes("1") && ids.includes("2")).toBe(false);
      expect(ids).not.toContain("4");
      expect(picks.length).toBe(3);
    }
  });
});
