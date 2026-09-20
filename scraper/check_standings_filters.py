from bs4 import BeautifulSoup
html = open('C:/work/nyhl/app/scraper/debug_standings.html', encoding='utf-8').read()
soup = BeautifulSoup(html, 'lxml')
for sel in soup.find_all('select'):
    sel_id = sel.get('id', 'unknown')
    print(f'--- {sel_id} ---')
    for opt in sel.find_all('option'):
        val = opt.get('value', '')
        txt = opt.get_text(strip=True)
        print(f'  {val} = {txt}')
    print()
