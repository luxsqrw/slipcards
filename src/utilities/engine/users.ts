import { Rarity, User, UserCard } from '@prisma/client'
import { debug, warn } from 'melchior'
import { getAllRarities } from './rarity.js'

// get how many cards a user has
export const getUserCardsCount = async (userId: number) => {
  const cards = await _brklyn.db.userCard.count({
    where: {
      userId
    }
  })

  return cards
}

// tries setting the user's favorite card. first, it'll check if the user has said card. if not, it'll return false.
// if the user has the card, it'll set the favorite card and return true.
export const setFavoriteCard = async (userId: number, cardId: number) => {
  const userCard = await _brklyn.db.userCard.findFirst({
    where: {
      userId,
      cardId
    },
    include: {
      card: true
    }
  })

  if (!userCard) return false

  debug('users', `setting favorite card for user ${userId} to ${cardId} (name: ${userCard.card.name})`)
  await _brklyn.db.userProfile.update({
    where: {
      userId
    },
    data: {
      favoriteCardId: userCard.id
    }
  })

  return true
}

export const setFavoriteColor = async (userId: number, color: string) => {
  debug('users', `setting favorite color for user ${userId} to ${color}`)
  await _brklyn.db.userProfile.update({
    where: {
      userId
    },
    data: {
      favoriteColor: color
    }
  })
}

export const setBiography = async (userId: number, bio: string) => {
  debug('users', `setting biography for user ${userId} to ${bio}`)
  await _brklyn.db.userProfile.update({
    where: {
      userId
    },
    data: {
      biography: bio
    }
  })
}

export const resetAllDraws = async (): Promise<void> => {
  await _brklyn.db.user.updateMany({ data: { usedDraws: 0 } })
}

export const resetAllDailies = async (): Promise<void> => {
  await _brklyn.db.user.updateMany({ data: { hasGottenDaily: false } })
}

export const resetAllReps = async (): Promise<void> => {
  await _brklyn.db.user.updateMany({ data: { hasGivenRep: false } })
}

export const giveRep = async (from: number, to: number): Promise<boolean> => {
  const toUserProfile = await _brklyn.db.userProfile.findFirst({
    where: { user: { tgId: to } },
    include: { user: true }
  })
  if (!toUserProfile) return false

  await _brklyn.db.user.update({
    where: { tgId: from },
    data: { hasGivenRep: true }
  })

  await _brklyn.db.userProfile.update({
    where: { id: toUserProfile.id },
    data: { reputation: toUserProfile.reputation + 1 }
  })

  return true
}

// cached
export const checkIfUserHasCards = async (user: number, cards: number[]): Promise<UserCard[]> => {
  const userCards = await _brklyn.db.userCard.findMany({
    where: {
      userId: user,
      cardId: {
        in: cards
      }
    }
  })

  return userCards
}

// this function returns the rarity of the card the user will get from a draw.
export const getRarityForUserDraw = async (user: User): Promise<Rarity> => {
  const rarities = await getAllRarities()

  const userChance = Math.random() - user.luckModifier
  let sum = 0
  let rarity = rarities[0]
  for (const r of rarities) {
    sum += r.chance
    if (userChance < sum) {
      rarity = r
      break
    }
  }

  if (sum > 1) warn('users.returnRarityForUser', `sum of rarities is greater than 1. sum: ${sum}`)

  return rarity
}

export const deduceDraw = async (userId: number): Promise<boolean> => {
  return await _brklyn.db.user.update({
    where: { id: userId },
    data: { usedDraws: { increment: 1 } }
  }).then(() => true).catch(() => false)
}

// gets how many users have this cars by using a group by query
export const getHowManyUsersHaveCard = async (cardId: number): Promise<number> => {
  const cached = await _brklyn.cache.get('cardUserCount', cardId.toString())
  if (cached) return cached

  const count = await _brklyn.db.userCard.groupBy({
    by: ['userId'],
    where: {
      cardId
    }
  })

  await _brklyn.cache.setexp('cardUserCount', cardId.toString(), count.length, 5 * 60)
  return count.length
}

export const getHowManyCardsUserHas = async (userId: number, cardId: number): Promise<number> => {
  return _brklyn.db.userCard.count({
    where: {
      userId,
      cardId
    }
  })
}

export const addDraw = async (userId: number, amount: number = 1): Promise<boolean> => {
  return await _brklyn.db.user.update({
    where: { id: userId },
    data: { usedDraws: { increment: amount } }
  }).then(() => true).catch(() => false)
}
