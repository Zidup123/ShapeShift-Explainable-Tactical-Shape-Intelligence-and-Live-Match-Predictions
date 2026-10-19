# Calibration report: Ardent League synthetic season

Seed 6. 56 matches, 8 fictional clubs, 14 matchdays. 58,412 events, 110,880 tracking rows.

## League averages versus real world targets

| Metric | Synthetic | Target band | Pass |
|---|---|---|---|
| Goals per match | 2.429 | 2.4 to 3.0 | yes |
| Shots per match | 26.554 | 24 to 28 | yes |
| Shots on target per match | 8.946 | 8 to 10 | yes |
| Goals per shot | 0.091 | 0.09 to 0.11 | yes |
| xG per shot | 0.099 | 0.09 to 0.11 | yes |
| Total xG per match | 2.636 | 2.4 to 3.0 | yes |
| Passes per match | 1016.518 | 850 to 1100 | yes |
| Pass completion | 0.801 | 0.77 to 0.83 | yes |
| Home win share | 0.464 | 0.40 to 0.50 | yes |
| Draw share | 0.286 | 0.20 to 0.30 | yes |
| Away win share | 0.250 | 0.25 to 0.35 | yes |
| Home goals minus away goals | 0.214 | 0.1 to 0.5 | yes |
| Counter attack share of shots | 0.157 | 0.10 to 0.22 | yes |

Goalless matches: 12.5%.

## Standings

| Pos | Club | P | W | D | L | GF | GA | GD | Pts | xG for | xG against |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Thornfield Rovers | 14 | 6 | 5 | 3 | 21 | 18 | 3 | 23 | 19.9 | 18.2 |
| 2 | Ashgrove United | 14 | 6 | 3 | 5 | 20 | 16 | 4 | 21 | 17.6 | 20.1 |
| 3 | Calder Wanderers | 14 | 7 | 0 | 7 | 19 | 21 | -2 | 21 | 17.8 | 18.8 |
| 4 | Marlowe City | 14 | 5 | 4 | 5 | 19 | 19 | 0 | 19 | 21.7 | 16.5 |
| 5 | Westhaven Albion | 14 | 3 | 8 | 3 | 12 | 10 | 2 | 17 | 14.1 | 17.6 |
| 6 | Redcliffe Town | 14 | 4 | 5 | 5 | 14 | 15 | -1 | 17 | 18.1 | 18.7 |
| 7 | Silverbrook FC | 14 | 5 | 2 | 7 | 19 | 21 | -2 | 17 | 17.8 | 19.1 |
| 8 | Eastmoor Athletic | 14 | 4 | 5 | 5 | 12 | 16 | -4 | 17 | 20.7 | 18.6 |

## Planted relationships (what your analysis should rediscover)

Open play shots per possession minute by best zone overload (attackers minus defenders in the final third):

| Best overload | Minutes | Shots per minute |
|---|---|---|
| -1 | 96 | 0.208 |
| +0 | 2750 | 0.234 |
| +1 | 2068 | 0.266 |
| +2 | 126 | 0.310 |

Mean xG per open play shot by overload in the shot's zone:

| Zone overload | Shots | Mean xG |
|---|---|---|
| -1 | 340 | 0.083 |
| +0 | 579 | 0.094 |
| +1 | 305 | 0.113 |
| +2 | 29 | 0.166 |

Counter attack shots conceded per possession minute by rest defence (outfield players behind the ball):

| Rest defenders | Minutes | Counter shots conceded per minute |
|---|---|---|
| 1 | 1 | 0.000 |
| 2 | 114 | 0.053 |
| 3 | 1106 | 0.069 |
| 4 | 2044 | 0.042 |
| 5 | 1056 | 0.041 |
| 6 | 719 | 0.033 |

These effects are built into the simulator, so recovering them proves the pipeline works. Do not present them as discoveries about real football. In the demo, label all findings as synthetic.

## Simplifications

- No substitutions, fouls, cards, set pieces or injuries. Eleven starters play 90 minutes.
- Positions are snapshots once per minute, with the team's possession phase for that minute.
- Players keep a fixed slot, so a defender can become a midfielder when a team changes shape.
- Possession is decided per minute, not per sequence.
