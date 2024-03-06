// responsible for determining which randomly selected card a user will get.
// cards have rarities, expressed as a number from 0 to 1, where 0 is 100% chance and 1 is 0% chance.

import { Category, Rarity, User, Card, Subcategory } from '@prisma/client'
import { error, info } from 'melchior'
import { MISSING_CARD_IMG } from '../constants.js'

export const getRarities = () => {
    return _brklyn.db.rarity.findMany()
}

export const getCategories = () => {
    return _brklyn.db.category.findMany()
}

export const getSubcategoriesByCategory = (category: Category) => {
    return _brklyn.db.subcategory.findMany({ where: { categoryId: category.id } })
}

export const resetDraws = async (user: User): Promise<void> => {
    await _brklyn.db.user.update({ where: { id: user.id }, data: { usedDraws: 0 } })
}

// this function increases the user's used draws by 1 and returns what card rarity the user will get.
export const deduceDraw = async (user: User, muteLog: boolean = false): Promise<Rarity> => {
    // if (user.usedDraws >= user.maximumDraws) throw new Error('User has no more draws left')
    await _brklyn.db.user.update({ where: { id: user.id }, data: { usedDraws: user.usedDraws + 1 } })
    const rarities = await getRarities()
    // the lower the rarity, the harder it is to get.
    const random = Math.random() - user.luckModifier
    // the rarities are sorted by their value and the sum of all their chances is 1.
    // we can iterate through the rarities and check if the random number is lower than the sum of the rarities' chances.
    let sum = 0
    let rarity = rarities[0]
    for (const r of rarities) {
        sum += r.chance
        if (random < sum) {
            rarity = r
            break
        }
    }
    if (sum > 1) throw new Error('The sum of all rarities is greater than 1. What the hell?')

    !muteLog && info('luckyEngine', `user ${user.tgId} got a ${rarity.name} card`)
    return rarity
}

// test function to see, in a sample of x draws, how many of each rarity was drawn.
export const testDraws = async (user: User, draws: number): Promise<void> => {
    const rarities = await getRarities()
    const results: Record<string, number> = {}
    for (const rarity of rarities) {
        results[rarity.name] = 0
    }
    for (let i = 0; i < draws; i++) {
        const rarity = await deduceDraw(user, true)
        results[rarity.name]++
    }
    info('luckyEngine', `user ${user.tgId} drew ${draws} cards. Results: ${JSON.stringify(results)}`)
}

// resets the draws of all users.
export const resetAllDraws = async (): Promise<void> => {
    await _brklyn.db.user.updateMany({ data: { usedDraws: 0 } })
}

// adds a card to the user's collection.
export const addCard = async (user: User, card: Card): Promise<void> => {
    // before adding, we have to check the luck modifier for the card. if it's higher than 0, we will roll a random number and check if it's lower than the luck modifier.
    // if it isn't, we will reroll the card.
    if (card.rarityModifier > 0) {
        info('luckyEngine', `user ${user.tgId} is rolling for a lucky card: ${card.name}`)
        const random = Math.random()
        if (card.rarityModifier >= random) {
            info('luckyEngine', `user ${user.tgId} got a lucky card: ${card.name}`)
        } else {
            // we will reuse the same rarity, category and subcategory to get a new card.
            const rarity = await _brklyn.db.rarity.findFirst({ where: { id: card.rarityId } })
            const category = await _brklyn.db.category.findFirst({ where: { id: card.categoryId } })
            const subcategory = await _brklyn.db.subcategory.findFirst({ where: { id: card.subcategoryId! } })
            const newCard = await selectRandomCard(rarity!, category!, subcategory!)
            return addCard(user, newCard)
        }
    }

    await _brklyn.db.userCard.create({
        data: {
            userId: user.id,
            cardId: card.id
        }
    })
}

// selects a random card given a rarity, a category and a subcategory.
export const selectRandomCard = async (rarity: Rarity, category: Category, subcategory: Subcategory, recursing: boolean = false): Promise<Card> => {
    let opts: { rarityId?: number } = {}
    if (!recursing) opts.rarityId = rarity.id

    const cards = await _brklyn.db.card.findMany({
        where: {
            ...opts,
            categoryId: category.id,
            subcategoryId: subcategory.id
        },
        include: {
            rarity: true,
            category: true,
            subcategory: true
        }
    }).catch((e) => {
      error('luckyEngine', `got a prisma error: ${e}`)
      return []
    })

    if (cards.length === 0) {
        if (recursing) {
          error('luckyEngine', `no cards found for rarity ${rarity.name}, category ${category.name} and subcategory ${subcategory.name}`)
          throw new Error('No cards found')
        }
        return selectRandomCard(rarity, category, subcategory, true)
    }
    return cards[Math.floor(Math.random() * cards.length)]
}

// test function that gives the user a random card for the dev category (id 1) and dev subcategory (id 1).
export const testRandomCard = async (user: User): Promise<void> => {
    const rarity = await deduceDraw(user, true)
    const category = await _brklyn.db.category.findFirst({ where: { id: 1 } })
    const subcategory = await _brklyn.db.subcategory.findFirst({ where: { id: 1 } })
    const card = await selectRandomCard(rarity, category!, subcategory!)
    await addCard(user, card)
    info('luckyEngine', `user ${user.tgId} got a ${rarity.name} card: ${card.name}`)
}

export const pickFourRandomSubcategories = async (category: Category): Promise<Subcategory[]> => {
    const subcategories = await getSubcategoriesByCategory(category)
    const result: Subcategory[] = []
    // if there are 4 or less subcategories, we will return them all.
    if (subcategories.length <= 4) return subcategories
    while (result.length < 4) {
        const subcategory = subcategories[Math.floor(Math.random() * subcategories.length)]
        if (!result.includes(subcategory)) result.push(subcategory)
    }
    return result
}

export const getUserTotalGivenCardAmount = async (user: User, card: Card): Promise<number> => {
    const baa = await _brklyn.db.userCard.findMany({ where: { userId: user.id, cardId: card.id } })
    return baa.length
}

export const getUserTotalCards = async (user: User): Promise<number> => {
    return _brklyn.db.userCard.count({ where: { userId: user.id } })
}

export const getUserCards = async (user: User): Promise<Card[]> => {
    const userCards = await _brklyn.db.userCard.findMany({ where: { userId: user.id }, include: { card: true } })
    return userCards.map((uc) => uc.card)
}

export const drawCard = async (user: User, category: Category, subcategory: Subcategory): Promise<Card> => {
    const rarity = await deduceDraw(user)
    const card = await selectRandomCard(rarity, category, subcategory)
    await addCard(user, card)
    return card
}

export const createSubcategory = async (name: string, category: Category): Promise<Subcategory> => {
    return _brklyn.db.subcategory.create({ data: { name, categoryId: category.id } })
}

export const deleteAllCardsOnSubcategory = async (subcategory: Subcategory): Promise<void> => {
    await _brklyn.db.card.deleteMany({ where: { subcategoryId: subcategory.id } })
}

export const deleteSubcategory = async (subcategory: Subcategory): Promise<void> => {
    await _brklyn.db.subcategory.delete({ where: { id: subcategory.id } })
}

export const getSubcategoryById = async (id: number) => {
    return _brklyn.db.subcategory.findFirst({ where: { id } })
}

export const getRarityById = async (id: number) => {
    return _brklyn.db.rarity.findFirst({ where: { id } })
}

export const batchAddCards = async (cards: Card[]): Promise<void> => {
    await _brklyn.db.card.createMany({ data: cards })
}

export const getCategoryById = async (id: number) => {
    return _brklyn.db.category.findFirst({ where: { id } })
}

export const parseImageString = (imageString: string, modifications: string | boolean | undefined = undefined): string => {
  if (!imageString) return MISSING_CARD_IMG
  // if it starts with http, return it as is
    if (imageString.includes('placehold.co')) return MISSING_CARD_IMG
  // if starts with url: then it's a url
    if (imageString.startsWith('url:')) {
      if (imageString.endsWith('.mp4')) return imageString.split('url:')[1]
        const url = imageString.split('url:')[1].replace('https://', '').replace('http://', '').replace('.gifv', '.gif')
        const cloudimgURL = `https://${process.env.CLOUDIMAGE_TOKEN}.cloudimg.io/${url}?aspect_ratio=3:4`
        return cloudimgURL
    }

    if (typeof modifications === 'boolean' && !modifications) return `https://res.cloudinary.com/dpi2t98hl/image/upload/${imageString.replace('id:', '')}.jpg`
    return `https://res.cloudinary.com/dpi2t98hl/image/upload/${modifications ?? 'ar_3:4,c_crop'}/${imageString.replace('id:', '')}.jpg`
}