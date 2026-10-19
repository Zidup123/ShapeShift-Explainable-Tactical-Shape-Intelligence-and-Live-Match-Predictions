# ShapeShift

Explainable tactical shape intelligence for football. ShapeShift reads how teams set up in and out of possession, links overloads to xG across a season, and turns that into live match predictions with a plain language narrative.

Built for the Microsoft x Premier League *Inside the Game* developer hackathon.

> All data is synthetic. Clubs, players and matches are fictional. No real match data is used.

## What it does

1. **Shape detection:** infers each team's shape in and out of possession from player positions.
2. **Overload analysis:** measures numerical advantages by zone and links them to shots and xG.
3. **Live prediction:** updates every minute with next goal probability, expected xG and counter attack risk.
4. **Narrative agent:** explains each insight, grounded in computed numbers and linked to the events behind it.

## Status

| Component | Status |
|---|---|
| Synthetic season generator | Done |
| Shape and overload detection | In progress |
| Prediction model | Planned |
| Narrative agent (Azure AI Foundry) | Planned |
| Match replay dashboard | Planned |

## Synthetic data

A fictional league of 8 clubs and 56 matches, with tracking style positions every minute plus passes and shots with xG. Calibrated against real world league averages (about 2.5 goals, 26 shots and 80% pass completion per match). Each club changes shape mid season, and the true shape schedule is included for validating detection.

    pip install numpy pandas
    python generate_season.py --seed 6 --out data

See `README_DATA.md` for the file and column guide.

## Explainability

Every insight links back to the matches, zones and events behind it. Sample sizes and confidence are shown, and the narrative agent only describes numbers computed in code.
