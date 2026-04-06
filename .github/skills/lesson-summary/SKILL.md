---
name: lesson-summary
description: 'Generuje zwięzłe podsumowanie lekcji AI devs z podziałem na sekcje. Użyj gdy chcesz: przegląd lekcji, podsumowanie dokumentu szkoleniowego, quick overview przed czytaniem pełnej treści.'
argument-hint: 'Nazwa pliku lekcji lub ścieżka (np. s01e03-projektowanie-api)'
user-invocable: true
---

# Lesson Summary Generator

## Cel
Generuje przystępne podsumowanie lekcji z kursu AI devs, dzieląc treść na sekcje i tworząc zwięzłe streszczenie każdej z nich zapisując podsumowanie do pliku (np. `artykuly/s01e03-summary.md`)

## Kiedy użyć
- Chcesz szybki przegląd lekcji przed jej szczegółowym czytaniem
- Potrzebujesz przypomnieć sobie kluczowe punkty z lekcji
- Chcesz zrozumieć strukturę i główne tematy lekcji
- Planujesz swoją naukę i chcesz wiedzieć co cię czeka

## Procedura

### 1. Identyfikacja pliku lekcji
- Jeśli użytkownik podał nazwę pliku, znajdź go w katalogu `artykuly/`
- Jeśli podał tylko numer lekcji (np. "s01e03"), wyszukaj plik zawierający ten wzorzec
- Jeśli nie podał niczego, zapytaj który plik lekcji chce podsumować

### 2. Odczytanie struktury
- Wczytaj cały plik lekcji
- Zidentyfikuj wszystkie sekcje główne (nagłówki `##`)
- Zachowaj hierarchię: główne sekcje i ewentualne podsekcje (`###`)
- Pomiń wszystko co znajduje się ponizej sekcji `## Fabuła`

### 3. Analiza każdej sekcji
Dla każdej sekcji głównej (`##`):
- Przeczytaj uważnie całą treść sekcji
- Zidentyfikuj kluczowe koncepcje, zasady, przykłady
- Wyodrębnij główną myśl i praktyczne wnioski
- Zanotuj ważne terminy techniczne

### 4. Generowanie podsumowania
Stwórz podsumowanie w następującym formacie:

```markdown
# Podsumowanie: [Tytuł lekcji]

## 📋 Przegląd ogólny
[1-2 zdania o czym jest cała lekcja]

---

## 📚 Podsumowanie sekcji

### [Nazwa sekcji 1]
**Kluczowe punkty:**
- Punkt 1
- Punkt 2
- Punkt 3

**W skrócie:** [1-2 zdania podsumowujące tę sekcję]

**Praktyczne zastosowanie:** [Jak to wykorzystać w praktyce]

---

### [Nazwa sekcji 2]
**Kluczowe punkty:**
- Punkt 1
- Punkt 2

**W skrócie:** [1-2 zdania]

**Praktyczne zastosowanie:** [Praktyczny wniosek]

---

[...kolejne sekcje...]

---

## 🎯 Kluczowe wnioski z całej lekcji
1. [Najważniejszy wniosek 1]
2. [Najważniejszy wniosek 2]
3. [Najważniejszy wniosek 3]

## 🔧 Co warto zapamiętać do praktyki
- [Praktyczna rada 1]
- [Praktyczna rada 2]
- [Praktyczna rada 3]
```

### 5. Zasady tworzenia podsumowań
- **Zwięzłość**: Każda sekcja to 3-5 punktów kluczowych + 1-2 zdania podsumowania
- **Klarowność**: Używaj prostego języka, unikaj zbędnego żargonu
- **Praktyczność**: Zawsze dodaj "praktyczne zastosowanie" - jak użyć tej wiedzy
- **Hierarchia**: Zachowaj strukturę oryginalnej lekcji
- **Terminologia**: Wyjaśniaj kluczowe terminy techniczne w nawiasach jeśli potrzeba
- **Przykłady**: Jeśli w sekcji są ważne przykłady kodu/diagramy, wymień je krótko

### 6. Specjalne sekcje
- Jeśli lekcja zawiera **Zadanie**, podsumuj je osobno na końcu
- Jeśli jest **Fabuła**, podsumuj ją w jednym akapicie
- Ignoruj sekcje czysto nawigacyjne (spis treści, przyciski itp.)

## Przykład użycia

```
User: Zrób podsumowanie lekcji s01e03
Agent: [Odczytuje plik, analizuje strukturę, generuje podsumowanie według szablonu]

User: podsumuj plik s01e01-programowanie-interakcji-z-modelem
Agent: [Znajduje plik, tworzy podsumowanie]
```

## Wskazówki
- Jeśli lekcja jest bardzo długa (>10 sekcji), grupuj podobne sekcje tematyczne
- Zachowaj emoji dla czytelności (📋 📚 🎯 🔧)
- Jeśli użytkownik chce bardziej szczegółowe podsumowanie konkretnej sekcji, pogłęb tylko tę część
- Po wygenerowaniu podsumowania, zapytaj czy użytkownik chce zapisać je do pliku

## Dodatkowe opcje
Możesz zapytać użytkownika:
- Czy chce skupić się tylko na wybranych sekcjach?
- Czy potrzebuje bardziej technicznego czy bardziej konceptualnego podsumowania?
