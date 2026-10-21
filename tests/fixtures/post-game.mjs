export const mockRawEog = {
  gameId: 5302198,
  gameMode: 'CLASSIC',
  queueId: 420,
  gameLength: 1845,
  teams: [
    {
      teamId: 100,
      isWinningTeam: true,
      stats: {
        BARRACKS_KILLED: 2,
        TURRETS_KILLED: 9,
        DRAGON_KILLS: 3,
        BARON_KILLS: 1
      },
      players: [
        {
          puuid: 'own-puuid-123',
          summonerName: '本家测试玩家',
          championId: 22,
          stats: {
            LEVEL: 16,
            CHAMPIONS_KILLED: 12,
            NUM_DEATHS: 2,
            ASSISTS: 14,
            TOTAL_DAMAGE_DEALT_TO_CHAMPIONS: 38200,
            TOTAL_DAMAGE_TAKEN: 14500,
            GOLD_EARNED: 15600,
            MINIONS_KILLED: 180,
            NEUTRAL_MINIONS_KILLED: 10,
            VISION_SCORE: 28,
            DAMAGE_DEALT_TO_TURRETS: 4200,
            ITEM0: 3006,
            ITEM1: 3031,
            ITEM2: 3072,
            ITEM3: 0,
            ITEM4: 0,
            ITEM5: 0,
            ITEM6: 3340
          }
        },
        ...Array.from({length: 4}, (_, i) => ({
          puuid: `ally-${i}`,
          summonerName: `队友${i}`,
          championId: 10 + i,
          stats: {
            LEVEL: 15,
            CHAMPIONS_KILLED: 4,
            NUM_DEATHS: 4,
            ASSISTS: 8,
            TOTAL_DAMAGE_DEALT_TO_CHAMPIONS: 15000,
            TOTAL_DAMAGE_TAKEN: 18000,
            GOLD_EARNED: 11000,
            MINIONS_KILLED: 150,
            VISION_SCORE: 20
          }
        }))
      ]
    },
    {
      teamId: 200,
      isWinningTeam: false,
      stats: {
        TURRETS_KILLED: 3,
        DRAGON_KILLS: 1,
        BARON_KILLS: 0
      },
      players: Array.from({length: 5}, (_, i) => ({
        puuid: `enemy-${i}`,
        summonerName: `对手${i}`,
        championId: 50 + i,
        stats: {
          LEVEL: 14,
          CHAMPIONS_KILLED: i === 0 ? 10 : 2,
          NUM_DEATHS: 6,
          ASSISTS: i === 0 ? 4 : 2,
          TOTAL_DAMAGE_DEALT_TO_CHAMPIONS: i === 0 ? 31000 : 8000,
          TOTAL_DAMAGE_TAKEN: 20000,
          GOLD_EARNED: i === 0 ? 13000 : 7000,
          MINIONS_KILLED: 120,
          VISION_SCORE: 15
        }
      }))
    }
  ]
};
