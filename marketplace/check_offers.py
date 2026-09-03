import sys, asyncio
sys.path.insert(0, '.')
from marketplace_server.models import async_session, Product
from sqlalchemy import select

async def test():
    async with async_session() as db:
        from marketplace_server.models import Product
        from sqlalchemy import select
        result = await db.execute(select(Product).where(Product.special_offer == True))
        offers = result.scalars().all()
        for o in offers:
            print(f'{o.id}: {o.name} - paid:{o.paid} special:{o.special_offer} discount:{o.offer_discount_pct}% baseline:{getattr(o, "baseline_usd", 0)}')
            print(f'  desc: {o.description[:80]}...')
        result2 = await db.execute(select(Product).where(Product.offer_discount_pct > 0))
        offers2 = result2.scalars().all()
        print(f'Products with discount > 0: {len(offers2)}')
        for o in offers2:
            print(f'  {o.id}: discount={o.offer_discount_pct}%')

asyncio.run(test())