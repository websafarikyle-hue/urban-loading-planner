from math import radians,sin,cos,asin,sqrt
def estimated_distance(a,b):
    lon1,lat1,lon2,lat2=map(radians,[a['lon'],a['lat'],b['lon'],b['lat']])
    h=sin((lat2-lat1)/2)**2+cos(lat1)*cos(lat2)*sin((lon2-lon1)/2)**2
    return 6371*2*asin(min(1,sqrt(h)))*1.28
def travel_leg(a,b,matrix=None):
    if matrix:
        index={p['id']:i for i,p in enumerate(matrix['points'])};i,j=index[a['id']],index[b['id']]
        km,minutes=matrix['distances'][i][j],matrix['durations'][i][j]
        return None if km is None or minutes is None else (km,minutes)
    km=estimated_distance(a,b);return km,km/28*60
