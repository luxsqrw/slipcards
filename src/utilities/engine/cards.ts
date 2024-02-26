import { getSubcategoryByID } from "./subcategories.js"

export interface CreateCardOptions {
    name: string
    subcategoryID: number
    categoryID: number
    rarityID: number
    image: string
    rarityModifier: number
}

export const createCard = async (options: CreateCardOptions) => {
    const { name, subcategoryID, categoryID, rarityID, image, rarityModifier } = options
    const sub = await getSubcategoryByID(subcategoryID)
    if (!sub) throw new Error(`Subcategory with ID ${subcategoryID} does not exist.`)

    // first, we'll check if the card already exists by checking if there's a card with the same name and the same subcategory name.
    const card = await _brklyn.db.card.findFirst({
        where: {
            name,
            subcategory: {
                name: sub.name
            }
        }
    })

    if (card) {
        // if the only difference is the rarity, we'll update the rarity and return the card.
        if (card.rarityId !== rarityID) {
            const updatedCard = await _brklyn.db.card.update({
                where: {
                    id: card.id
                },
                data: {
                    rarityId: rarityID
                }
            })
            return updatedCard
        }
    }
    const newCard = await _brklyn.db.card.create({
        data: {
            name,
            subcategoryId: sub.id,
            categoryId: categoryID,
            rarityId: rarityID,
            image,
            rarityModifier
        }
    })

    return newCard
}

export const getCardByID = async (id: number | undefined) => {
    if (!id) return null
    return await _brklyn.db.card.findFirst({
        where: {
            id
        },
        include: {
            rarity: true
        }
    })
}

export const getCardFullByID = async (id: number | undefined) => {
    if (!id) return null
    return await _brklyn.db.card.findFirst({
        where: {
            id
        },
        include: {
            rarity: true,
            category: true,
            subcategory: true
        }
    })
}

// gets the card by the name (case insensitive)
export const getCardByName = async (name: string) => {
    const cached = await _brklyn.cache.get('cardByName', name.toLowerCase())
    if (cached) return cached
    const card = await _brklyn.db.card.findFirst({
        where: {
            name: {
                equals: name,
                mode: 'insensitive'
            }
        }
    })
    if (card) await _brklyn.cache.setexp('cardByName', name.toLowerCase(), card, 30 * 60)
    return card
}