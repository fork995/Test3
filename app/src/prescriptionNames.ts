// Public original main-WLNNV7A3.js: Wte, OU, Eo, hA. No patient data.
import type { Category } from "./model";
export const PRESCRIPTION_NAMES: Record<Category, readonly string[]> = {
  MONITORING: [
    "Дыхание",
    "Положение тела",
    "Пульс",
    "Социальное поведение",
    "Температура",
  ],
  ACTIVITY: [
    "Активность",
    "Аппетит",
    "Дефекация",
    "Жажда",
    "Мочеиспускание",
    "Прогулка",
    "Рвота",
  ],
  SOLUTION: [
    "Ацисоль",
    "Дисоль",
    "Йоностерил",
    "Натрия хлорид - 0,9%",
    "Раствор Рингера",
    "Стерофундин",
    "Трисоль",
  ],
  MEDICATION: [
    "АЦЦ",
    "Акупан",
    "Амантадин",
    "Амитриптиллин",
    "Амлодипин",
    "Амоксиклав",
    "Анальгин",
    "Ацилок",
    "Вазотоп",
    "Ветмедин",
    "Габапентин",
    "Гептрал",
    "Глюкоза",
    "Дексаметазон",
    "Дексаметозон",
    "Дексдомитор",
    "Дексдор",
    "Доксициклин",
    "Допамин",
    "Дюспаталин",
    "Калия оротат",
    "Калия хлорид",
    "Кальция глюконат",
    "Каниквантел Плюс",
    "Канинсулин",
    "Квамател",
    "Кеппра",
    "Клопидогрель",
    "Конвения",
    "Лантус",
    "Латран",
    "Левосимендан",
    "Лидокаин",
    "Магния сульфат",
    "Марбофлоксацин",
    "Марфлоксин",
    "Мелоксивет",
    "Мелоксидил",
    "Меропенем",
    "Меропинем",
    "Метилпреднизолон",
    "Метронидазол",
    "Микролакс",
    "Миртазапин",
    "НО-ШПА",
    "Нобивак Bb",
    "Нобивак DHP",
    "Нобивак DHPPI",
    "Нобивак KC",
    "Нобивак L4",
    "Нобивак Puppy DP",
    "Нобивак RL",
    "Нобивак Rabies",
    "Нобивак Трикет Трио",
    "Норадреналин",
    "Омепразол",
    "Онсиор",
    "Паглюферал-1",
    "Паглюферал-2",
    "Паглюферал-3",
    "Пипольфен",
    "Пиро-Стоп",
    "Полисорб",
    "Преднизолон",
    "Пропофол",
    "Протафан",
    "Пульмикорт",
    "Ронаксан",
    "Сальбутамол",
    "Селафорт",
    "Серения",
    "Синулокс",
    "Смекта",
    "Солу-Медрол",
    "Спазмалгон",
    "Стронгхолд",
    "Сукральфат",
    "Теразозин",
    "Тиамина хлорид",
    "Тиенам",
    "Тилозин",
    "Тобрекс",
    "Тразодон",
    "Тракриум",
    "Трамадол",
    "Урсофальк",
    "Фебтал",
    "Фликсотид",
    "Фортекор",
    "Фрагмин",
    "Фуросемид",
    "Церукал",
    "Цефазолин",
    "Цефтриаксон",
    "Цианокобаламин",
    "Цианокоболамин",
    "Ципрофлоксацин",
    "Энрофоксацин",
    "Энтеросгель",
  ],
  PROCEDURE: ["Взятие образцов крови", "Уход за катетерами"],
  NURSING: ["Кормление", "Циркадные ритмы"],
};
export const CONCENTRATION_HINTS: Record<
  string,
  { value: number; units: { substance: string; volume: string } }[]
> = {
  Марфлоксин: [
    {
      value: 5,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 20,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 80,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 20,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
    {
      value: 100,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
  ],
  Лидокаин: [
    {
      value: 20,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
    {
      value: 100,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
  ],
  Амоксиклав: [
    {
      value: 250,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 500,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 875,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
  ],
  Цефазолин: [
    {
      value: 250,
      units: {
        substance: "MILLIGRAM",
        volume: "VIAL",
      },
    },
    {
      value: 500,
      units: {
        substance: "MILLIGRAM",
        volume: "VIAL",
      },
    },
    {
      value: 1000,
      units: {
        substance: "MILLIGRAM",
        volume: "VIAL",
      },
    },
  ],
  Ципрофлоксацин: [
    {
      value: 250,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 500,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 750,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 2,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
    {
      value: 10,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
    {
      value: 3,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
  ],
  Метронидазол: [
    {
      value: 250,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 500,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 5,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
  ],
  Тилозин: [
    {
      value: 50,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
    {
      value: 200,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
  ],
  Габапентин: [
    {
      value: 300,
      units: {
        substance: "MILLIGRAM",
        volume: "CAPSULE",
      },
    },
  ],
  Дексдор: [
    {
      value: 100,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
  ],
  Дексдомитор: [
    {
      value: 0.1,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
    {
      value: 0.5,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
  ],
  Мелоксивет: [
    {
      value: 2,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
  ],
  Мелоксидил: [
    {
      value: 1.5,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
  ],
  Преднизолон: [
    {
      value: 5,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 30,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
  ],
  Дексаметазон: [
    {
      value: 0.5,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 4,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
    {
      value: 1,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
  ],
  Метилпреднизолон: [
    {
      value: 4,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 16,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 32,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 4,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
    {
      value: 250,
      units: {
        substance: "MILLIGRAM",
        volume: "VIAL",
      },
    },
  ],
  Онсиор: [
    {
      value: 5,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 10,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 20,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 40,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 6,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 20,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
  ],
  "Солу-Медрол": [
    {
      value: 250,
      units: {
        substance: "MILLIGRAM",
        volume: "VIAL",
      },
    },
    {
      value: 500,
      units: {
        substance: "MILLIGRAM",
        volume: "VIAL",
      },
    },
    {
      value: 1000,
      units: {
        substance: "MILLIGRAM",
        volume: "VIAL",
      },
    },
  ],
  "Калия хлорид": [
    {
      value: 30,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
    {
      value: 40,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
    {
      value: 75,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
    {
      value: 150,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
  ],
  "Магния сульфат": [
    {
      value: 200,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
    {
      value: 250,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
  ],
  Ветмедин: [
    {
      value: 1.25,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 5,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 10,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 0.75,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
  ],
  Фуросемид: [
    {
      value: 40,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 10,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
  ],
  Церукал: [
    {
      value: 10,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 5,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
  ],
  Анальгин: [
    {
      value: 500,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 250,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
    {
      value: 500,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
  ],
  Спазмалгон: [
    {
      value: 500,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 500,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
  ],
  Серения: [
    {
      value: 10,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
  ],
  Амлодипин: [
    {
      value: 2.5,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 5,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 10,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
  ],
  Трамадол: [
    {
      value: 50,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
    {
      value: 50,
      units: {
        substance: "MILLIGRAM",
        volume: "CAPSULE",
      },
    },
    {
      value: 100,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
    {
      value: 50,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 100,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 100,
      units: {
        substance: "MILLIGRAM",
        volume: "SUPPOSITORY",
      },
    },
  ],
  Допамин: [
    {
      value: 5,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
    {
      value: 10,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
    {
      value: 20,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
    {
      value: 40,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
  ],
  Норадреналин: [
    {
      value: 1,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
    {
      value: 2,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
  ],
  Левосимендан: [
    {
      value: 2.5,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
  ],
  Амитриптиллин: [
    {
      value: 25,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 10,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
  ],
  Омепразол: [
    {
      value: 10,
      units: {
        substance: "MILLIGRAM",
        volume: "CAPSULE",
      },
    },
    {
      value: 20,
      units: {
        substance: "MILLIGRAM",
        volume: "CAPSULE",
      },
    },
    {
      value: 40,
      units: {
        substance: "MILLIGRAM",
        volume: "CAPSULE",
      },
    },
    {
      value: 10,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 20,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 40,
      units: {
        substance: "MILLIGRAM",
        volume: "VIAL",
      },
    },
  ],
  Тразодон: [
    {
      value: 150,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
  ],
  Теразозин: [
    {
      value: 2,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 5,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
  ],
  Миртазапин: [
    {
      value: 15,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 30,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 45,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
  ],
  Вазотоп: [
    {
      value: 1.25,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 2.5,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 5,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
  ],
  "Тиамина хлорид": [
    {
      value: 50,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
  ],
  Цианокоболамин: [
    {
      value: 200,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
    {
      value: 500,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
  ],
  Урсофальк: [
    {
      value: 250,
      units: {
        substance: "MILLIGRAM",
        volume: "CAPSULE",
      },
    },
    {
      value: 500,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 50,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
  ],
  Квамател: [
    {
      value: 20,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 40,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 20,
      units: {
        substance: "MILLIGRAM",
        volume: "VIAL",
      },
    },
  ],
  Кеппра: [
    {
      value: 250,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 500,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 1000,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 100,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
  ],
  "Паглюферал-1": [
    {
      value: 25,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
  ],
  "Паглюферал-2": [
    {
      value: 35,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
  ],
  "Паглюферал-3": [
    {
      value: 50,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
  ],
  Пропофол: [
    {
      value: 10,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
  ],
  Доксициклин: [
    {
      value: 100,
      units: {
        substance: "MILLIGRAM",
        volume: "CAPSULE",
      },
    },
  ],
  Ронаксан: [
    {
      value: 20,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 100,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
  ],
  Фебтал: [
    {
      value: 150,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 222,
      units: {
        substance: "MILLIGRAM",
        volume: "GRAMME",
      },
    },
  ],
  "Каниквантел Плюс": [
    {
      value: 500,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
  ],
  Амантадин: [
    {
      value: 100,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 0.4,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
  ],
  Синулокс: [
    {
      value: 50,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 250,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 500,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 140,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
  ],
  Конвения: [
    {
      value: 340,
      units: {
        substance: "MILLIGRAM",
        volume: "VIAL",
      },
    },
    {
      value: 825,
      units: {
        substance: "MILLIGRAM",
        volume: "VIAL",
      },
    },
  ],
  Микролакс: [
    {
      value: 5,
      units: {
        substance: "MILLILITRE",
        volume: "MICRO_ENEMA",
      },
    },
  ],
  Гептрал: [
    {
      value: 400,
      units: {
        substance: "MILLIGRAM",
        volume: "VIAL",
      },
    },
    {
      value: 400,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
  ],
  Полисорб: [
    {
      value: 1,
      units: {
        substance: "GRAMME",
        volume: "GRAMME",
      },
    },
  ],
  Энтеросгель: [
    {
      value: 0.7,
      units: {
        substance: "GRAMME",
        volume: "GRAMME",
      },
    },
  ],
  Смекта: [
    {
      value: 3,
      units: {
        substance: "GRAMME",
        volume: "SACHET",
      },
    },
  ],
  Акупан: [
    {
      value: 10,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
  ],
  "Пиро-Стоп": [
    {
      value: 120,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
  ],
  Пипольфен: [
    {
      value: 25,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
    {
      value: 25,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
  ],
  Латран: [
    {
      value: 2,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
    {
      value: 4,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
  ],
  Ацилок: [
    {
      value: 25,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
    {
      value: 150,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 300,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
  ],
  Канинсулин: [
    {
      value: 40,
      units: {
        substance: "INTERNATIONAL_UNIT",
        volume: "MILLILITRE",
      },
    },
  ],
  Протафан: [
    {
      value: 100,
      units: {
        substance: "INTERNATIONAL_UNIT",
        volume: "MILLILITRE",
      },
    },
  ],
  Лантус: [
    {
      value: 100,
      units: {
        substance: "INTERNATIONAL_UNIT",
        volume: "MILLILITRE",
      },
    },
  ],
  Тракриум: [
    {
      value: 10,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
  ],
  Сальбутамол: [
    {
      value: 100,
      units: {
        substance: "MILLIGRAM",
        volume: "DOSE",
      },
    },
  ],
  "Калия оротат": [
    {
      value: 500,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
  ],
  Глюкоза: [
    {
      value: 50,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
    {
      value: 100,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
    {
      value: 250,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
    {
      value: 400,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
  ],
  Фортекор: [
    {
      value: 2.5,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 5,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 20,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
  ],
  "Кальция глюконат": [
    {
      value: 100,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
    {
      value: 500,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
  ],
  Цефтриаксон: [
    {
      value: 250,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
    {
      value: 500,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 1000,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
    {
      value: 2000,
      units: {
        substance: "MILLIGRAM",
        volume: "TABLET",
      },
    },
  ],
  Фликсотид: [
    {
      value: 50,
      units: {
        substance: "MILLIGRAM",
        volume: "DOSE",
      },
    },
    {
      value: 125,
      units: {
        substance: "MILLIGRAM",
        volume: "DOSE",
      },
    },
    {
      value: 250,
      units: {
        substance: "MILLIGRAM",
        volume: "DOSE",
      },
    },
  ],
  Пульмикорт: [
    {
      value: 0.25,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
    {
      value: 0.5,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
  ],
  Цианокобаламин: [
    {
      value: 200,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
    {
      value: 500,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
  ],
  Меропенем: [
    {
      value: 500,
      units: {
        substance: "MILLIGRAM",
        volume: "VIAL",
      },
    },
    {
      value: 1,
      units: {
        substance: "GRAMME",
        volume: "VIAL",
      },
    },
  ],
  Тобрекс: [
    {
      value: 3,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
  ],
  Стронгхолд: [
    {
      value: 60,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
    {
      value: 120,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
  ],
  Селафорт: [
    {
      value: 60,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
    {
      value: 120,
      units: {
        substance: "MILLIGRAM",
        volume: "MILLILITRE",
      },
    },
  ],
  "Нобивак Трикет Трио": [
    {
      value: 1,
      units: {
        substance: "MILLILITRE",
        volume: "DOSE",
      },
    },
  ],
  "Нобивак L4": [
    {
      value: 1,
      units: {
        substance: "MILLILITRE",
        volume: "DOSE",
      },
    },
  ],
  "Нобивак Rabies": [
    {
      value: 1,
      units: {
        substance: "MILLILITRE",
        volume: "DOSE",
      },
    },
  ],
  "Нобивак RL": [
    {
      value: 1,
      units: {
        substance: "MILLILITRE",
        volume: "DOSE",
      },
    },
  ],
  "Нобивак KC": [
    {
      value: 0.4,
      units: {
        substance: "MILLILITRE",
        volume: "DOSE",
      },
    },
  ],
  "Нобивак DHPPI": [
    {
      value: 0.5,
      units: {
        substance: "MILLILITRE",
        volume: "DOSE",
      },
    },
  ],
  "Нобивак Puppy DP": [
    {
      value: 0.5,
      units: {
        substance: "MILLILITRE",
        volume: "DOSE",
      },
    },
  ],
  "Нобивак DHP": [
    {
      value: 0.5,
      units: {
        substance: "MILLILITRE",
        volume: "DOSE",
      },
    },
  ],
  "Нобивак Bb": [
    {
      value: 0.6,
      units: {
        substance: "MILLILITRE",
        volume: "DOSE",
      },
    },
  ],
};
export function nameHints(type: Category, query: string) {
  return PRESCRIPTION_NAMES[type].filter((n) =>
    n.toLowerCase().includes(query.toLowerCase()),
  );
}
