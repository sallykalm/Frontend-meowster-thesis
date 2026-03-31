@echo off
REM Quick verification script for TypeScript fix

echo.
echo ========================================
echo Verifying TypeScript Compilation
echo ========================================
echo.

echo Step 1: Type checking...
npx tsc --noEmit
if %errorlevel% equ 0 (
    echo ✓ Type checking passed
) else (
    echo ✗ Type checking failed
    pause
    exit /b 1
)

echo.
echo Step 2: Linting...
npm run lint
if %errorlevel% equ 0 (
    echo ✓ Linting passed
) else (
    echo ✗ Linting failed
    pause
    exit /b 1
)

echo.
echo Step 3: Building...
npm run build
if %errorlevel% equ 0 (
    echo ✓ Build passed
    echo.
    echo All checks passed! You can now run: npm run dev
) else (
    echo ✗ Build failed
    pause
    exit /b 1
)

pause
