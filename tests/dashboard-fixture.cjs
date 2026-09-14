// Synthetic games used only by the browser tests and explicitly labeled preview.
const baseStats={points:0,fgm:0,fga:0,threeMade:0,threeAttempts:0,ftm:0,fta:0,offensive:0,defensive:0,rebounds:0,assists:0,steals:0,blocks:0,turnovers:0,fouls:0};
const names=['牛天齐','Alex Chen','Marcus Lee','Daniel Wu','James Lin','Ryan Wang'];
const roster=names.map((player_name,i)=>({player_id:'P'+(i+1),player_name,jersey_number:[7,11,23,3,15,9][i]}));
function makeGame(id,date,category,opponent='Northside Hawks'){
 const players=roster.map((p,i)=>({...p,played_count:1,played_ms:[1800000,1800000,2400000,1800000,2400000,1800000][i],starter_count:i<5?1:0,designated_count:1,stats:{...baseStats,points:[20,18,14,12,10,6][i],fgm:[8,7,5,4,4,2][i],fga:[16,14,10,8,8,4][i],threeMade:i<4?2:0,threeAttempts:i<4?5:0,ftm:2,fta:i<2?4:3,offensive:[1,1,4,1,3,0][i],defensive:[3,3,7,3,6,2][i],rebounds:[4,4,11,4,9,2][i],assists:[6,4,2,3,1,2][i],steals:[2,1,1,2,0,1][i],blocks:[0,0,3,0,2,0][i],turnovers:2,fouls:2}}));
 const home_stats=players.reduce((s,p)=>{for(const k in baseStats)s[k]+=p.stats[k];return s;},{...baseStats});
 return {game_id:id,game_date:date,category,opponent,home_points:80,away_points:70,home_stats,away_stats:{...baseStats,points:70,fgm:26,fga:58,threeMade:8,threeAttempts:22,ftm:10,fta:10,offensive:8,defensive:22,rebounds:30,assists:14,steals:5,blocks:3,turnovers:14,fouls:17},duration_ms:2400000,stats_complete:true,coverage:'complete',players};
}
const snapshot={schema_version:1,revision:12,generated_at:'2026-09-13T12:00:00Z',roster,games:[makeGame('spring','2026-04-02','official'),makeGame('summer','2026-07-31','friendly'),makeGame('fall1','2026-08-01','official'),makeGame('fall2','2026-08-09','friendly','Westside Wolves'),makeGame('fall3','2026-08-18','official','Harbor University'),makeGame('fall4','2026-08-27','friendly','Central Eagles'),makeGame('fall5','2026-09-05','official','Lakeside Bears'),makeGame('fall6','2026-09-12','friendly','City Falcons'),makeGame('winter','2027-02-02','official'),makeGame('old','2025-10-01',null)]};
// Vary opponents' scores for a meaningful wins/losses chart.
snapshot.games[3].away_points=86;snapshot.games[3].away_stats.points=86;
snapshot.games[5].away_points=82;snapshot.games[5].away_stats.points=82;
module.exports={snapshot,makeGame};
